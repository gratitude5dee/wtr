/**
 * The consent documents themselves (goal.md P0-1). A consent acceptance is a
 * versioned artifact: the row records the exact version, SHA-256 and URI of
 * what the creator accepted. Publishing a new version means adding a new
 * constant here — never editing an existing one, because historical rows
 * point at the old hash and must stay verifiable forever.
 */
import { sha256Bytes, stripHexPrefix } from "../crypto/canonical";

export interface ConsentDocument {
  version: string;
  uri: string;
  text: string;
}

export const CURRENT_TOS: ConsentDocument = {
  version: "wtr-tos-2026-08",
  uri: "/legal/wtr-tos-2026-08",
  text: `WTR Terms of Service (wtr-tos-2026-08)

1. You confirm you hold the rights to every file you upload, or are authorised
   by the rights holder to license it.
2. Your original file is encrypted on your device before upload. WTR stores
   only the ciphertext and a degraded public preview.
3. When you list an asset you choose exactly what buyers may do with it,
   including whether AI labs may train on it. That choice is enforced by the
   license attached on-chain, not by policy alone.
4. Licenses already sold remain valid if you later withdraw an asset. Access
   already granted cannot be recalled.
5. WTR records your consent version, its hash, and the time of acceptance,
   and publishes provenance for every listed asset.`,
};

export const CURRENT_PRIVACY: ConsentDocument = {
  version: "wtr-privacy-2026-08",
  uri: "/legal/wtr-privacy-2026-08",
  text: `WTR Privacy Policy (wtr-privacy-2026-08)

1. Public provenance records identify you only by a stable pseudonym
   (anon_id). Your name, email and wallet address are never written to any
   public record.
2. KYC is performed by a third-party provider; WTR stores only the resulting
   status and country code.
3. Plaintext media never reaches WTR servers; we cannot read your originals.`,
};

/** The scopes an acceptance grants. Stored verbatim on the row. */
export const CURRENT_SCOPES = { upload: true, list: true, sell: true } as const;

export async function documentSha256(document: ConsentDocument): Promise<string> {
  return stripHexPrefix(await sha256Bytes(new TextEncoder().encode(document.text)));
}
