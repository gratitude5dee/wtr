/**
 * The trace-v1.0 document the builder produces: every field of the extended
 * shape, the PII guard that gates all of it, and the stability of the canonical
 * `metadata_root` (an unstable root would turn a retry into a conflict).
 */
import { describe, expect, it } from "vitest";

import { MemoryAssetStore } from "../../pipeline/testing/memory-store";
import { buildTraceDocument } from "../../pipeline/trace-document";
import { EVENT } from "../../pipeline/types";
import type { AssetRow } from "../../pipeline/types";
import type { ConsentRow, CreatorRow } from "../../pipeline/store";
import { attestationPayloadHash, type AttestationSigner } from "../attestation";
import { assertNoPii, metadataRoot } from "../schema";

const CONTENT_SHA = "a".repeat(64);
const TOS_SHA = "b".repeat(64);
const PRIVACY_SHA = "c".repeat(64);
const INGESTED_AT = new Date("2026-02-01T10:00:00.000Z");
const CAPTURED_AT = "2026-01-15T08:30:00.000Z";

const asset: AssetRow = {
  id: "asset-1",
  creatorId: "creator-1",
  stage: "LABELED",
  mediaType: "image/png",
  filename: "shot.png",
  byteSize: 2048,
  contentSha256: CONTENT_SHA,
  duplicateClaimFlag: false,
  ipfsCid: null,
  mediaVaultUuid: null,
  traceDataId: null,
  traceMetadataRoot: null,
  traceUpdateCount: 0,
  ipId: null,
  spgNftContract: null,
  nftTokenId: null,
  licenseTermsId: null,
  cdrVaultUuid: null,
};

const creator: CreatorRow = {
  id: "creator-1",
  anonId: "anon-creator-1",
  kycStatus: "verified",
  kycCountry: "us",
  taxStatus: "submitted",
  walletVerified: true,
};

const consent: ConsentRow = {
  documentVersion: "tos-2026-01",
  documentSha256: TOS_SHA,
  documentUri: "https://wtr.example/tos/2026-01",
  privacyVersion: "privacy-2026-01",
  privacySha256: PRIVACY_SHA,
  privacyUri: "https://wtr.example/privacy/2026-01",
  scopes: { ai_training: true },
  acceptedAt: new Date("2026-01-20T00:00:00.000Z"),
};

const signer: AttestationSigner = {
  keyId: "wtr-attestation-1",
  keyUrl: "https://wtr.example/.well-known/trace-keys.json",
  sign: async (payloadHash) => `sig:${payloadHash}`,
};

async function seededStore(
  overrides: {
    creator?: Partial<CreatorRow>;
    consent?: ConsentRow | null;
    labels?: Record<string, unknown>;
  } = {},
): Promise<MemoryAssetStore> {
  const store = new MemoryAssetStore({
    asset,
    creator: { ...creator, ...overrides.creator },
    consent: overrides.consent === undefined ? consent : (overrides.consent ?? undefined),
  });
  await store.appendEvent({ assetId: asset.id, eventType: EVENT.INGESTED });
  store.events[0].createdAt = INGESTED_AT;
  const labels = overrides.labels ?? {
    phash64: "0123456789abcdef",
    dhash64: "fedcba9876543210",
    ahash64: "00ff00ff00ff00ff",
    keyframe_phashes: ["1111111111111111", "2222222222222222"],
    captured_at: CAPTURED_AT,
  };
  await store.putLabels(
    asset.id,
    Object.entries(labels).map(([key, value]) => ({
      namespace: "wtr",
      key,
      value,
      source: "model" as const,
    })),
  );
  return store;
}

const build = async (store: MemoryAssetStore, extra = {}) =>
  buildTraceDocument(store, asset.id, { attestationSigner: signer, ...extra });

describe("file.hashes", () => {
  it("carries the tier-1 perceptual hashes", async () => {
    const document = await build(await seededStore());

    expect(document.file.hashes).toEqual({
      phash64: "0123456789abcdef",
      dhash64: "fedcba9876543210",
      ahash64: "00ff00ff00ff00ff",
      keyframe_phashes: ["1111111111111111", "2222222222222222"],
    });
  });

  it("is omitted when nothing was measured, and drops malformed hashes", async () => {
    expect((await build(await seededStore({ labels: {} }))).file.hashes).toBeUndefined();
    expect(
      (await build(await seededStore({ labels: { phash64: "NOTAHASH", ahash64: "00ff00ff00ff00ff" } })))
        .file.hashes,
    ).toEqual({ ahash64: "00ff00ff00ff00ff" });
  });
});

describe("timestamps", () => {
  it("reports the capture moment separately from ingest", async () => {
    const document = await build(await seededStore());

    expect(document.timestamps.captured_at).toBe(CAPTURED_AT);
    expect(document.timestamps.originated_at).toBe(INGESTED_AT.toISOString());
    expect(document.timestamps.uploaded_at).toBe(INGESTED_AT.toISOString());
  });

  it("ignores a capture moment after the upload — that is a wrong clock", async () => {
    const store = await seededStore({ labels: { captured_at: "2030-01-01T00:00:00.000Z" } });

    expect((await build(store)).timestamps.captured_at).toBeUndefined();
  });

  it("keeps originated_at fixed while later state is promoted", async () => {
    const store = await seededStore();
    const paymentCreditedAt = new Date("2026-03-01T00:00:00.000Z");

    const registration = await build(store);
    const update = await build(store, { paymentCreditedAt });

    expect(update.timestamps.originated_at).toBe(registration.timestamps.originated_at);
    expect(update.timestamps.payment_credited_at).toBe(paymentCreditedAt.toISOString());
  });
});

describe("contributor", () => {
  it("carries the extended KYC / tax / verification state", async () => {
    const document = await build(await seededStore());

    expect(document.contributor).toMatchObject({
      anon_id: "anon-creator-1",
      kyc_status: "verified",
      // Normalised to ISO-3166-1 alpha-2; geo never goes finer than country.
      kyc_country: "US",
      geo_region: "US",
      tax_status: "submitted",
      account_verification_status: "wallet_verified",
    });
  });

  it("omits geo entirely when the country is unknown or not a country code", async () => {
    for (const kycCountry of [null, "Berlin, Germany"]) {
      const document = await build(await seededStore({ creator: { kycCountry } }));
      expect(document.contributor.kyc_country).toBeUndefined();
      expect(document.contributor.geo_region).toBeUndefined();
    }
  });

  it("carries both consent documents by version, hash and URI", async () => {
    const document = await build(await seededStore());

    expect(document.contributor.consent).toEqual({
      tos_version: "tos-2026-01",
      tos_hash: `sha256:${TOS_SHA}`,
      tos_uri: "https://wtr.example/tos/2026-01",
      privacy_policy_version: "privacy-2026-01",
      privacy_policy_hash: `sha256:${PRIVACY_SHA}`,
      privacy_policy_uri: "https://wtr.example/privacy/2026-01",
    });
  });

  it("keeps consent null when the creator has accepted nothing", async () => {
    expect((await build(await seededStore({ consent: null }))).contributor.consent).toBeNull();
  });
});

describe("app.legal_entity", () => {
  it("names the entity behind the platform", async () => {
    const document = await build(await seededStore());

    expect(document.app.platform_name).toBe("wtr");
    expect(document.app.legal_entity).toBeTruthy();
  });
});

describe("asset grouping", () => {
  it("carries the collection the caller exported under", async () => {
    const document = await build(await seededStore(), { asset: { collection_id: "dataset-7" } });

    expect(document.asset).toEqual({ collection_id: "dataset-7" });
  });

  it("is omitted when the asset belongs to no batch, buyer or task", async () => {
    expect((await build(await seededStore())).asset).toBeUndefined();
  });
});

describe("attestation", () => {
  it("hashes the canonical payload without the attestation block and signs it", async () => {
    const document = await build(await seededStore());
    const attestation = document.attestation;
    if (!attestation) throw new Error("expected an attestation block");

    expect(attestation.payload_hash).toBe(await attestationPayloadHash(document));
    expect(attestation.payload_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(attestation.signature).toBe(`sig:${attestation.payload_hash}`);
    expect(attestation.key_id).toBe(signer.keyId);
    expect(attestation.key_url).toBe(signer.keyUrl);
    expect(attestation.signed_at_utc).toBe(document.timestamps.uploaded_at);
  });

  it("omits the signature when no signing key is configured (staging)", async () => {
    const document = await buildTraceDocument(await seededStore(), asset.id, {
      attestationSigner: { keyId: "wtr-staging" },
    });

    expect(document.attestation?.signature).toBeUndefined();
    expect(document.attestation?.payload_hash).toBe(await attestationPayloadHash(document));
  });

  it("is absent entirely when attestation is turned off", async () => {
    const document = await buildTraceDocument(await seededStore(), asset.id, {
      attestationSigner: null,
    });

    expect(document.attestation).toBeUndefined();
  });
});

describe("metadata_root", () => {
  it("is stable across rebuilds of the same state, attested or not", async () => {
    const first = await build(await seededStore());
    const second = await build(await seededStore());
    expect(await metadataRoot(first)).toBe(await metadataRoot(second));

    const unattested = await buildTraceDocument(await seededStore(), asset.id, {
      attestationSigner: null,
    });
    expect(await metadataRoot(unattested)).toBe(
      await metadataRoot(
        await buildTraceDocument(await seededStore(), asset.id, { attestationSigner: null }),
      ),
    );
  });

  it("changes when promoted state changes", async () => {
    const registration = await build(await seededStore());
    const settled = await build(await seededStore(), {
      paymentCreditedAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(await metadataRoot(settled)).not.toBe(await metadataRoot(registration));
  });
});

describe("assertNoPii", () => {
  it("accepts the fully populated extended document", async () => {
    const document = await build(await seededStore(), { asset: { collection_id: "dataset-7" } });

    expect(() => assertNoPii(document)).not.toThrow();
  });

  it("still rejects PII smuggled through the provider payload", async () => {
    const document = await build(await seededStore(), {
      providerPayload: { creator_email: "someone@example.com" },
    });

    expect(() => assertNoPii(document)).toThrow(/PII/);
  });
});
