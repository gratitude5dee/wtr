/**
 * Trace Schema v1.0 documents, as specified by the DATA Foundation Trace
 * integration guide (docs.datafdn.org).
 *
 * Two hard rules (goal.md §5, §12):
 *  1. NO PII. A contributor is identified by `contributor.anon_id` only — never
 *     a name, email, wallet-linked identity or filename that could carry one.
 *  2. Metadata updates are FULL STATE, never diffs, and the root of each update
 *     chains onto the previous one.
 *
 * Normalized fields (`file`, `contributor`, `app`, `timestamps`) are the
 * portable contract Trace's frontend and audit flows read; everything
 * WTR-specific is preserved verbatim under `provider_payload`.
 */
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";

export const TRACE_SCHEMA_VERSION = "trace-v1.0" as const;

/** Canonical content-hash / metadata-root form: `sha256:<64-lowercase-hex>`. */
export type Sha256Ref = `sha256:${string}`;

export function toSha256Ref(hash: string): Sha256Ref {
  const bare = hash.startsWith("0x") ? hash.slice(2) : hash.replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(bare.toLowerCase())) {
    throw new Error("not a 64-hex SHA-256 value");
  }
  return `sha256:${bare.toLowerCase()}`;
}

export type TraceMediaCategory = "audio" | "video" | "image" | "document";

export interface TraceContributor {
  /** Stable pseudonym. Never a name, email or handle. */
  anon_id: string;
  kyc_status: "unverified" | "pending" | "verified" | "failed";
  consent: {
    tos_version: string;
    tos_hash: Sha256Ref;
  } | null;
}

/** The canonical, full-state document. Its SHA-256 is the `metadata_root`. */
export interface TraceDocument {
  schema_version: typeof TRACE_SCHEMA_VERSION;
  file: {
    content_sha256: Sha256Ref;
    mime_type: string;
    media_category: TraceMediaCategory;
    size_bytes: number | null;
  };
  contributor: TraceContributor;
  app: {
    platform_name: string;
  };
  timestamps: {
    originated_at: string;
    uploaded_at: string;
    /** Promoted to Trace when a payout is credited (goal.md §5 subset). */
    payment_credited_at?: string;
  };
  /** Everything WTR-specific, echoed back verbatim by the audit views. */
  provider_payload: Record<string, unknown>;
}

export function mediaCategory(mimeType: string): TraceMediaCategory {
  const prefix = mimeType.split("/")[0]?.toLowerCase();
  if (prefix === "audio" || prefix === "video" || prefix === "image") return prefix;
  return "document";
}

/**
 * `initial_metadata_root` / `metadata_root`: a deterministic SHA-256 over the
 * canonical serialisation of the trace-v1.0 document, in the API's
 * `sha256:<64-hex>` form. The DATA Foundation canonicalizes metadata JSON
 * before hashing, so key order never affects idempotency.
 */
export async function metadataRoot(document: TraceDocument): Promise<Sha256Ref> {
  return `sha256:${stripHexPrefix(await sha256Canonical(document))}`;
}

/** Structural guard against leaking PII into a Trace payload. */
const PII_KEY_PATTERN = /(^|_)(email|name|phone|address_line|dob|ssn|passport|handle|username)($|_)/i;

/** Trace Schema fields whose keys trip the pattern but carry no PII. */
const PII_KEY_ALLOWLIST = new Set(["platform_name"]);

export function assertNoPii(document: TraceDocument): void {
  const walk = (value: unknown, path: string): void => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY_PATTERN.test(key) && !PII_KEY_ALLOWLIST.has(key)) {
        throw new Error(`Trace payload would leak PII at ${path}.${key}`);
      }
      walk(entry, `${path}.${key}`);
    }
  };
  walk(document, "$");
}
