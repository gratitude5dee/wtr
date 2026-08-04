/**
 * Builds the FULL-STATE trace-v1.0 document for an asset from current WTR
 * state. Every Trace call — the initial registration and each promoted update —
 * sends one of these; diffs are never sent (goal.md §5).
 */
import { CHAIN_ID } from "../../../config/chain";
import type { LicensePreset } from "../story/license-presets";
import {
  TRACE_SCHEMA_VERSION,
  mediaCategory,
  toSha256Ref,
  type TraceDocument,
} from "../trace/schema";
import { EVENT } from "./types";

import type { AssetStore } from "./store";

export async function buildTraceDocument(
  store: AssetStore,
  assetId: string,
  overrides: {
    licensePreset?: LicensePreset;
    paymentCreditedAt?: Date | null;
    takedown?: { requested_at: string; reason: string } | null;
    providerPayload?: Record<string, unknown>;
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

  const payout = await (async () => {
    const sale = await store.getSale(assetId);
    return sale ? store.getPayout(sale.id) : null;
  })();

  const ingestedAt = events.find((event) => event.eventType === EVENT.INGESTED)?.createdAt;
  const uploadedAt = (ingestedAt ?? new Date()).toISOString();
  const paymentCreditedAt =
    (overrides.paymentCreditedAt ?? payout?.paymentCreditedAt ?? null)?.toISOString() ?? undefined;

  return {
    schema_version: TRACE_SCHEMA_VERSION,
    file: {
      content_sha256: toSha256Ref(asset.contentSha256),
      mime_type: asset.mediaType,
      media_category: mediaCategory(asset.mediaType),
      size_bytes: asset.byteSize,
    },
    contributor: {
      // Pseudonym only — never a name, email or filename (goal.md §12).
      anon_id: creator.anonId,
      kyc_status: creator.kycStatus,
      consent: consent
        ? {
            tos_version: consent.documentVersion,
            tos_hash: toSha256Ref(consent.documentSha256),
          }
        : null,
    },
    app: {
      platform_name: "wtr",
    },
    timestamps: {
      // The record's origin moment; fixed across later updates, whose root
      // `occurred_at` dates the update itself.
      originated_at: uploadedAt,
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
}
