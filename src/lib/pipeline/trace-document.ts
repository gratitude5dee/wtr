/**
 * Builds the FULL-STATE trace-v1.0 document for an asset from current WTR
 * state. Every Trace call — the initial registration and each promoted update —
 * sends one of these; diffs are never sent (goal.md §5).
 */
import { CHAIN_ID } from "../../../config/chain";
import { TRACE_LEGAL_ENTITY } from "../../../config/env";
import { HASH64_HEX } from "../labels/perceptual-hash";
import type { LicensePreset } from "../story/license-presets";
import {
  attestDocument,
  configuredAttestationSigner,
  type AttestationSigner,
  type UnattestedTraceDocument,
} from "../trace/attestation";
import {
  TRACE_SCHEMA_VERSION,
  mediaCategory,
  toSha256Ref,
  type TraceAssetGrouping,
  type TraceConsent,
  type TraceDocument,
  type TraceFileHashes,
} from "../trace/schema";
import { EVENT } from "./types";

import type { ConsentRow, CreatorRow, AssetStore } from "./store";

/** ISO-3166-1 alpha-2, so no finer-grained location can slip into the payload. */
const COUNTRY_CODE = /^[A-Z]{2}$/;

function countryCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  return COUNTRY_CODE.test(upper) ? upper : undefined;
}

function hash64(value: unknown): string | undefined {
  return typeof value === "string" && HASH64_HEX.test(value) ? value : undefined;
}

/** Perceptual fingerprints measured at tier 1, read back from the label store. */
function fileHashes(labels: Record<string, unknown>): TraceFileHashes | undefined {
  const keyframes = labels["wtr:keyframe_phashes"];
  const hashes: TraceFileHashes = {
    ...(hash64(labels["wtr:phash64"]) ? { phash64: hash64(labels["wtr:phash64"]) } : {}),
    ...(hash64(labels["wtr:dhash64"]) ? { dhash64: hash64(labels["wtr:dhash64"]) } : {}),
    ...(hash64(labels["wtr:ahash64"]) ? { ahash64: hash64(labels["wtr:ahash64"]) } : {}),
  };
  if (Array.isArray(keyframes)) {
    const frames = keyframes.map(hash64).filter((frame): frame is string => frame !== undefined);
    if (frames.length > 0) hashes.keyframe_phashes = frames;
  }
  return Object.keys(hashes).length > 0 ? hashes : undefined;
}

/** A capture moment is only reported when it is a real, past instant. */
function capturedAt(value: unknown, uploadedAt: string): string | undefined {
  if (!(typeof value === "string" || value instanceof Date)) return undefined;
  const captured = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(captured.getTime())) return undefined;
  const iso = captured.toISOString();
  return iso <= uploadedAt ? iso : undefined;
}

function contributorConsent(consent: ConsentRow | null): TraceConsent | null {
  if (!consent) return null;
  const privacyHash = consent.privacySha256 ? toSha256Ref(consent.privacySha256) : undefined;
  return {
    tos_version: consent.documentVersion,
    tos_hash: toSha256Ref(consent.documentSha256),
    ...(consent.documentUri ? { tos_uri: consent.documentUri } : {}),
    ...(consent.privacyVersion ? { privacy_policy_version: consent.privacyVersion } : {}),
    ...(privacyHash ? { privacy_policy_hash: privacyHash } : {}),
    ...(consent.privacyUri ? { privacy_policy_uri: consent.privacyUri } : {}),
  };
}

/**
 * Country-level jurisdiction only: the KYC country is the single geo signal WTR
 * holds, and nothing address- or GPS-derived is ever admitted (goal.md §12).
 */
function contributorGeo(creator: CreatorRow): { kyc_country?: string; geo_region?: string } {
  const country = countryCode(creator.kycCountry);
  return country ? { kyc_country: country, geo_region: country } : {};
}

export async function buildTraceDocument(
  store: AssetStore,
  assetId: string,
  overrides: {
    licensePreset?: LicensePreset;
    paymentCreditedAt?: Date | null;
    takedown?: { requested_at: string; reason: string } | null;
    providerPayload?: Record<string, unknown>;
    /** Batch / campaign / task grouping, when the caller knows it. */
    asset?: TraceAssetGrouping;
    /** Injected in tests; defaults to the environment's configured signer. */
    attestationSigner?: AttestationSigner | null;
  } = {},
): Promise<TraceDocument> {
  const asset = await store.getAsset(assetId);
  if (!asset) throw new Error(`Unknown asset ${assetId}`);
  const creator = await store.getCreator(asset.creatorId);
  if (!creator) throw new Error(`Unknown creator ${asset.creatorId}`);
  const consent = await store.getLatestConsent(asset.creatorId);
  const labels = await store.getLabels(assetId);
  const events = await store.listEvents(assetId);

  const preset =
    overrides.licensePreset ?? ((labels["wtr:license_preset"] as LicensePreset | undefined) ?? null);
  const presetRow = preset ? await store.getLicensePreset(preset) : null;


  const ingestedAt = events.find((event) => event.eventType === EVENT.INGESTED)?.createdAt;
  const uploadedAt = (ingestedAt ?? new Date()).toISOString();
  const captured = capturedAt(labels["wtr:captured_at"], uploadedAt);
  const sale = await store.getSale(assetId);
  const grouping: TraceAssetGrouping = {
    ...(sale ? { customer_id: sale.buyerAnonId } : {}),
    ...(overrides.asset ?? {}),
  };
  const payout = sale ? await store.getPayout(sale.id) : null;
  const paymentCreditedAt =
    (overrides.paymentCreditedAt ?? payout?.paymentCreditedAt ?? null)?.toISOString() ?? undefined;

  const hashes = fileHashes(labels);

  const unattested: UnattestedTraceDocument = {
    schema_version: TRACE_SCHEMA_VERSION,
    file: {
      content_sha256: toSha256Ref(asset.contentSha256),
      mime_type: asset.mediaType,
      media_category: mediaCategory(asset.mediaType),
      size_bytes: asset.byteSize,
      ...(hashes ? { hashes } : {}),
    },
    contributor: {
      // Pseudonym only — never a name, email or filename (goal.md §12).
      anon_id: creator.anonId,
      kyc_status: creator.kycStatus,
      ...contributorGeo(creator),
      ...(creator.taxStatus ? { tax_status: creator.taxStatus } : {}),
      ...(creator.walletVerified === undefined
        ? {}
        : {
            account_verification_status: creator.walletVerified
              ? ("wallet_verified" as const)
              : ("unverified" as const),
          }),
      consent: contributorConsent(consent),
    },
    ...(Object.keys(grouping).length > 0 ? { asset: grouping } : {}),
    app: {
      platform_name: "wtr",
      legal_entity: TRACE_LEGAL_ENTITY(),
    },
    timestamps: {
      // The record's origin moment; fixed across later updates, whose root
      // `occurred_at` dates the update itself.
      originated_at: uploadedAt,
      ...(captured ? { captured_at: captured } : {}),
      uploaded_at: uploadedAt,
      ...(paymentCreditedAt ? { payment_credited_at: paymentCreditedAt } : {}),
    },
    provider_payload: {
      asset_ref: asset.id,
      ipfs_cid: asset.ipfsCid,
      labels,
      license:
        preset && presetRow
          ? {
              preset,
              license_terms_id: presetRow.licenseTermsId.toString(),
              terms_uri: presetRow.termsUri,
              terms_sha256: presetRow.termsSha256,
              ai_learning_models: presetRow.aiLearningModels,
            }
          : null,
      consent_scopes: consent?.scopes ?? null,
      consent_accepted_at: consent?.acceptedAt.toISOString() ?? null,
      chain: {
        chain_id: CHAIN_ID,
        ip_id: asset.ipId,
        cdr_vault_uuid: asset.cdrVaultUuid,
      },
      takedown: overrides.takedown ?? null,
      ...(overrides.providerPayload ?? {}),
    },
  };

  const signer =
    overrides.attestationSigner === undefined
      ? configuredAttestationSigner()
      : overrides.attestationSigner;
  if (!signer) return unattested;

  // `signed_at_utc` is the moment of the state being attested, not wall-clock
  // time of the call: a retried registration must re-derive a byte-identical
  // document, or the provider sees a metadata conflict instead of a duplicate.
  const attestation = await attestDocument(unattested, signer, latestStateAt(unattested));
  return { ...unattested, attestation };
}

/** Most recent instant the document itself asserts. */
function latestStateAt(document: UnattestedTraceDocument): string {
  const { originated_at, captured_at, uploaded_at, payment_credited_at } = document.timestamps;
  return [originated_at, captured_at, uploaded_at, payment_credited_at]
    .filter((value): value is string => typeof value === "string")
    .sort()
    .slice(-1)[0];
}
