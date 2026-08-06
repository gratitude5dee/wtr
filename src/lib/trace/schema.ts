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

/**
 * Consent state. Both documents the creator accepted are carried: the terms of
 * service and the privacy policy, each by version, content hash and URI, so an
 * auditor can re-fetch the exact text that was agreed to.
 */
export interface TraceConsent {
  tos_version: string;
  tos_hash: Sha256Ref;
  tos_uri?: string;
  privacy_policy_version?: string;
  privacy_policy_hash?: Sha256Ref;
  privacy_policy_uri?: string;
}

export interface TraceContributor {
  /** Stable pseudonym. Never a name, email or handle. */
  anon_id: string;
  kyc_status: "unverified" | "pending" | "verified" | "failed";
  /** ISO 3166-1 alpha-2 country of the KYC record. Country granularity only. */
  kyc_country?: string;
  /**
   * Coarse jurisdiction of the contributor, at country granularity. Never an
   * address, postcode or GPS-derived location.
   */
  geo_region?: string;
  tax_status?: "not_submitted" | "submitted" | "verified";
  /** How far the platform account itself is verified (wallet proof of control). */
  account_verification_status?: "unverified" | "wallet_verified";
  consent: TraceConsent | null;
}

/**
 * Perceptual fingerprints of the content (Tier-1 measurement). Similarity
 * signals only — they cannot reconstruct the media and carry no PII.
 */
export interface TraceFileHashes {
  phash64?: string;
  dhash64?: string;
  ahash64?: string;
  /** Per-keyframe phashes for video, in keyframe order. */
  keyframe_phashes?: string[];
}

/**
 * Signature over the canonical trace-v1.0 payload, which is what lets the
 * "Attested" lifecycle step render. `payload_hash` is the SHA-256 of the
 * canonical document WITHOUT this block, so the attestation never has to hash
 * itself. `signature` is optional on staging, where signing may be unconfigured.
 */
export interface TraceAttestation {
  payload_hash: Sha256Ref;
  signature?: string;
  key_id: string;
  key_url?: string;
  signed_at_utc: string;
}

/** Optional grouping ids: batch / campaign / task an asset belongs to. */
export interface TraceAssetGrouping {
  /** Dataset (batch) the asset was exported under. */
  collection_id?: string;
  /** Lab (buyer) the asset was licensed to. Pseudonymous id, never a name. */
  customer_id?: string;
  /** Data request / brief the asset was submitted to. */
  task_id?: string;
}

/** The canonical, full-state document. Its SHA-256 is the `metadata_root`. */
export interface TraceDocument {
  schema_version: typeof TRACE_SCHEMA_VERSION;
  file: {
    content_sha256: Sha256Ref;
    mime_type: string;
    media_category: TraceMediaCategory;
    size_bytes: number | null;
    hashes?: TraceFileHashes;
  };
  contributor: TraceContributor;
  asset?: TraceAssetGrouping;
  app: {
    platform_name: string;
    legal_entity?: string;
  };
  timestamps: {
    originated_at: string;
    /** When the content itself was captured, when the creator's file reveals it. */
    captured_at?: string;
    uploaded_at: string;
    /** Promoted to Trace when a payout is credited (goal.md §5 subset). */
    payment_credited_at?: string;
  };
  attestation?: TraceAttestation;
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
