/**
 * Redacting logger.
 *
 * goal.md §12: plaintext media bytes, decryption keys and private keys must
 * never be logged — not at debug level, not in an error report. Rather than
 * trusting call sites, every value passed through this logger is scrubbed:
 * byte arrays are replaced with a length marker and any field whose key looks
 * key-ish is replaced with `[redacted]`.
 */
import { LOG_LEVEL } from "../../config/env";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Level = keyof typeof LEVELS;

const SECRET_KEY_PATTERN =
  /(privatekey|priv_key|secret|password|passphrase|apikey|api_key|token(?!ids?$)|datakey|data_key|decryptionkey|plaintext|bytes|content|ciphertext|mnemonic|seed|authorization|cookie)/i;

export const REDACTED = "[redacted]";

function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Uint8Array || Array.isArray(value) === false && ArrayBuffer.isView(value)) {
    return `[bytes len=${(value as Uint8Array).byteLength}]`;
  }
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value !== "object") return value;
  if (depth >= 6) return "[depth-limit]";
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry, depth + 1);
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
  const line = { level, ts: new Date().toISOString(), message, ...(fields ? redact(fields) : {}) };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
