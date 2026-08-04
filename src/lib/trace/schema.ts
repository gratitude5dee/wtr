/**
 * Trace `trace-v1.0` documents.
 *
 * Two hard rules (goal.md §5, §12):
 *  1. NO PII. A contributor is identified by `contributor.anon_id` only — never
 *     a name, email, wallet-linked identity or filename that could carry one.
 *  2. Metadata updates are FULL STATE, never diffs, and the root of each update
 *     chains onto the previous one.
 */
import { sha256Canonical } from "../crypto/canonical";

export const TRACE_SCHEMA = "trace-v1.0" as const;

export interface TraceContributor {
  /** Stable pseudonym. Never a name, email or handle. */
  anon_id: string;
  kyc_status: "unverified" | "pending" | "verified" | "failed";
  consent: {
    document_version: string;
    document_sha256: string;
    scopes: Record<string, boolean>;
    accepted_at: string;
  } | null;
}

export interface TraceLicense {
  preset: string;
  license_terms_id: string;
  terms_uri: string;
  terms_sha256: string;
  ai_learning_models: boolean;
}

/** The canonical, full-state document. Its SHA-256 is the `metadata_root`. */
export interface TraceDocument {
  schema: typeof TRACE_SCHEMA;
  asset: {
    /** WTR asset id — an opaque UUID, not derived from content or identity. */
    ref: string;
    media_type: string;
    content_sha256: string;
    byte_size: number | null;
    ipfs_cid: string | null;
  };
  contributor: TraceContributor;
  license: TraceLicense | null;
  labels: Record<string, unknown>;
  chain: {
    chain_id: number;
    ip_id: string | null;
    cdr_vault_uuid: number | null;
  };
  settlement: {
    /** Promoted to Trace when a payout is credited (goal.md §5 subset). */
    payment_credited_at: string | null;
  };
  takedown: { requested_at: string; reason: string } | null;
  /** Everything WTR wants echoed back verbatim lives here, under `provider_payload`. */
  provider_payload: Record<string, unknown>;
}

/**
 * `initial_metadata_root` / `metadata_root`: a deterministic SHA-256 over the
 * canonical serialisation of the trace-v1.0 document.
 */
export async function metadataRoot(document: TraceDocument): Promise<`0x${string}`> {
  return sha256Canonical(document);
}

/** Structural guard against leaking PII into a Trace payload. */
const PII_KEY_PATTERN = /(^|_)(email|name|phone|address_line|dob|ssn|passport|handle|username)($|_)/i;

export function assertNoPii(document: TraceDocument): void {
  const walk = (value: unknown, path: string): void => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY_PATTERN.test(key)) {
        throw new Error(`Trace payload would leak PII at ${path}.${key}`);
      }
      walk(entry, `${path}.${key}`);
    }
  };
  walk(document, "$");
}
