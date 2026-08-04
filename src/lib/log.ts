/**
 * Redacting logger.
 *
 * goal.md §12: plaintext media bytes, decryption keys and private keys must
 * never be logged — not at debug level, not in an error report. Rather than
 * trusting call sites, everything passed through this logger is scrubbed, by
 * three independent mechanisms, because no single one of them is sufficient:
 *
 *  - Any binary value becomes a length marker, whatever its field is called.
 *  - Any field whose *name* looks key-ish becomes `[redacted]`.
 *  - Any *other* string is scrubbed by shape: a long hex or base64 run is
 *    replaced wherever it appears — including in the message and in
 *    third-party error text whose wording we never chose — unless its field is
 *    a named operational identifier we deliberately keep readable.
 *
 * The shape-based pass is what makes the guarantee hold. Field names are
 * open-ended: an SDK may call a key `sk` or bury it in `error.message`, so name
 * matching alone can only ever be best effort. Hence the polarity — a string is
 * scrubbed unless it is *known* to be safe, rather than kept unless it is known
 * to be secret.
 */
import { LOG_LEVEL } from "../../config/env";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Level = keyof typeof LEVELS;

const SECRET_KEY_PATTERN =
  /(private_?key|priv_?key|signingkey|signing_key|encryptionkey|encryption_key|keymaterial|key_material|wallet_?key|^s?k$|^pk$|^dek$|wrappeddek|wrapped_dek|secret|password|passphrase|apikey|api_key|token(?!ids?$)|datakey|data_key|decryptionkey|plaintext|bytes|content|ciphertext|mnemonic|seed|authorization|cookie|^blob$|^body$|^raw$)/i;

/**
 * Key material by shape rather than by name: a 32-byte-or-longer hex run (a
 * private key, a data key) or a 32-byte-or-longer base64 run. A 20-byte address
 * (40 nibbles) stays below the bound and remains readable.
 *
 * `/` is deliberately excluded from the base64 alphabet so a run cannot span
 * path separators — otherwise a whole URL path collapses into one `[redacted]`
 * and an operator can no longer tell which document was published. A base64
 * secret containing `/` is therefore matched in pieces, which still redacts it
 * as long as a piece reaches the bound.
 */
const SECRET_VALUE_PATTERN = /(0x)?[0-9a-f]{64,}|[A-Za-z0-9+_-]{43,}={0,2}/gi;

/**
 * Identifiers that are secret-shaped but are meant to be read: without this a
 * tx hash and a 32-byte secret key are indistinguishable by shape, and losing
 * tx hashes or content addresses from the logs would make an on-chain failure
 * untraceable and a published document unfetchable.
 */
const READABLE_SUFFIX_PATTERN =
  /(^|_)(tx_hash|hash|ip_id|id|ids|address|owner|cid|cids|uuid|root|sha256|digest|uri|url|explorer)$/;

/** Matches `metadataRoot` as well as `metadata_root`: both spellings occur here. */
function isReadableIdentifier(key: string): boolean {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return READABLE_SUFFIX_PATTERN.test(snake);
}

export const REDACTED = "[redacted]";

/** Blanks anything key-shaped inside free text (a message, an SDK error string). */
export function redactText(text: string): string {
  return text.replace(SECRET_VALUE_PATTERN, REDACTED);
}

function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Uint8Array || Array.isArray(value) === false && ArrayBuffer.isView(value)) {
    return `[bytes len=${(value as Uint8Array).byteLength}]`;
  }
  if (typeof value === "bigint") return `${value.toString()}n`;
  // Reached for array elements; a string under a key is handled below, where the
  // field name is available to decide whether it is a readable identifier.
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  if (typeof value !== "object") return value;
  if (depth >= 6) return "[depth-limit]";
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else if (typeof entry === "string") {
      out[key] = isReadableIdentifier(key) ? entry : redactText(entry);
    } else {
      out[key] = redactValue(entry, depth + 1);
    }
  }
  return out;
}

/** Exposed for tests and for anything that hands data to an error reporter (e.g. Sentry `beforeSend`). */
export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  return redactValue(fields) as Record<string, unknown>;
}

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  const configured = (LOG_LEVEL() as Level) in LEVELS ? (LOG_LEVEL() as Level) : "info";
  if (LEVELS[level] < LEVELS[configured]) return;
  const line = {
    level,
    ts: new Date().toISOString(),
    message: redactText(message),
    ...(fields ? redact(fields) : {}),
  };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
