/**
 * Attestation signing: configuration gating and, with a key, a signature that
 * verifies and never changes for the same payload.
 */
import { afterEach, describe, expect, it } from "vitest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  attestDocument,
  attestationPayloadHash,
  configuredAttestationSigner,
} from "../attestation";
import { TRACE_SCHEMA_VERSION, type TraceDocument } from "../schema";

const KEY = `0x${"11".repeat(32)}` as const;

const document: Omit<TraceDocument, "attestation"> = {
  schema_version: TRACE_SCHEMA_VERSION,
  file: {
    content_sha256: `sha256:${"a".repeat(64)}`,
    mime_type: "image/png",
    media_category: "image",
    size_bytes: 10,
  },
  contributor: { anon_id: "anon-1", kyc_status: "verified", consent: null },
  app: { platform_name: "wtr" },
  timestamps: { originated_at: "2026-01-01T00:00:00.000Z", uploaded_at: "2026-01-01T00:00:00.000Z" },
  provider_payload: {},
};

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("configuredAttestationSigner", () => {
  it("is off without a key id", () => {
    delete process.env.WTR_TRACE_ATTESTATION_KEY_ID;
    expect(configuredAttestationSigner()).toBeNull();
  });

  it("identifies the key but cannot sign when only the key id is set", () => {
    process.env.WTR_TRACE_ATTESTATION_KEY_ID = "wtr-staging";
    delete process.env.WTR_TRACE_ATTESTATION_KEY;
    const signer = configuredAttestationSigner();

    expect(signer?.keyId).toBe("wtr-staging");
    expect(signer?.sign).toBeUndefined();
  });

  it("signs verifiably and deterministically once a key is configured", async () => {
    process.env.WTR_TRACE_ATTESTATION_KEY_ID = "wtr-prod";
    process.env.WTR_TRACE_ATTESTATION_KEY = KEY;
    const signer = configuredAttestationSigner();
    if (!signer?.sign) throw new Error("expected a signing signer");

    const attestation = await attestDocument(document, signer, "2026-01-01T00:00:00.000Z");
    const again = await attestDocument(document, signer, "2026-01-01T00:00:00.000Z");

    expect(attestation.payload_hash).toBe(await attestationPayloadHash(document));
    expect(attestation).toEqual(again);
    expect(
      await verifyMessage({
        address: privateKeyToAccount(KEY).address,
        message: attestation.payload_hash,
        signature: attestation.signature as `0x${string}`,
      }),
    ).toBe(true);
  });
});

describe("attestationPayloadHash", () => {
  it("ignores an existing attestation block, so the hash never covers itself", async () => {
    const bare = await attestationPayloadHash(document);
    const attested: TraceDocument = {
      ...document,
      attestation: {
        payload_hash: bare,
        key_id: "wtr-prod",
        signed_at_utc: "2026-01-01T00:00:00.000Z",
      },
    };

    expect(await attestationPayloadHash(attested)).toBe(bare);
  });
});
