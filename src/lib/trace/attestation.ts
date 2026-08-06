/**
 * Attestation of a trace-v1.0 document.
 *
 * WTR signs the canonical payload so Trace's "Attested" lifecycle step can
 * render and an auditor can verify, from the published key, that the metadata
 * WTR committed is the metadata WTR produced. The hash is taken over the
 * document WITHOUT its `attestation` block, so the block never hashes itself.
 *
 * Signing is gated on configuration: with no key configured (staging, local,
 * tests) the block still carries `payload_hash` + `key_id` and simply omits
 * `signature`. The key itself is never logged or persisted (goal.md §12).
 */
import { privateKeyToAccount } from "viem/accounts";

import { TRACE_ATTESTATION_KEY, TRACE_ATTESTATION_KEY_ID, TRACE_ATTESTATION_KEY_URL } from "../../../config/env";
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";
import type { Sha256Ref, TraceAttestation, TraceDocument } from "./schema";

/** A document as it looks before it is attested. */
export type UnattestedTraceDocument = Omit<TraceDocument, "attestation">;

export interface AttestationSigner {
  keyId: string;
  keyUrl?: string;
  /** Absent on staging: the payload is hashed and identified, but not signed. */
  sign?: (payloadHash: Sha256Ref) => Promise<string>;
}

/** SHA-256 over the canonical document, excluding any `attestation` block. */
export async function attestationPayloadHash(
  document: UnattestedTraceDocument | TraceDocument,
): Promise<Sha256Ref> {
  const payload: Record<string, unknown> = { ...document };
  delete payload.attestation;
  return `sha256:${stripHexPrefix(await sha256Canonical(payload))}`;
}

/**
 * The signer described by the environment, or `null` when attestation is turned
 * off entirely (no key id configured).
 */
export function configuredAttestationSigner(): AttestationSigner | null {
  const keyId = TRACE_ATTESTATION_KEY_ID();
  if (!keyId) return null;
  const keyUrl = TRACE_ATTESTATION_KEY_URL() ?? undefined;
  const privateKey = TRACE_ATTESTATION_KEY();
  if (!privateKey) return { keyId, keyUrl };
  const account = privateKeyToAccount(privateKey);
  return {
    keyId,
    keyUrl,
    // secp256k1 with RFC-6979 nonces: the same payload hash always yields the
    // same signature, so re-deriving a document never changes its root.
    sign: (payloadHash) => account.signMessage({ message: payloadHash }),
  };
}

export async function attestDocument(
  document: UnattestedTraceDocument,
  signer: AttestationSigner,
  signedAtUtc: string,
): Promise<TraceAttestation> {
  const payloadHash = await attestationPayloadHash(document);
  const signature = signer.sign ? await signer.sign(payloadHash) : undefined;
  return {
    payload_hash: payloadHash,
    ...(signature ? { signature } : {}),
    key_id: signer.keyId,
    ...(signer.keyUrl ? { key_url: signer.keyUrl } : {}),
    signed_at_utc: signedAtUtc,
  };
}
