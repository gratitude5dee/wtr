/**
 * Builds the FULL-STATE trace-v1.0 document for an asset from current WTR
 * state. Every Trace call — the initial registration and each promoted update —
 * sends one of these; diffs are never sent (goal.md §5).
 */
import { CHAIN_ID } from "../../../config/chain";
import type { LicensePreset } from "../story/license-presets";
import { TRACE_SCHEMA, type TraceDocument } from "../trace/schema";

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

  const preset =
    overrides.licensePreset ?? ((labels["wtr:license_preset"] as LicensePreset | undefined) ?? null);
  const presetRow = preset ? await store.getLicensePreset(preset) : null;

  const payout = await (async () => {
    const sale = await store.getSale(assetId);
    return sale ? store.getPayout(sale.id) : null;
  })();

  return {
    schema: TRACE_SCHEMA,
    asset: {
      ref: asset.id,
      media_type: asset.mediaType,
      content_sha256: asset.contentSha256,
      byte_size: asset.byteSize,
      ipfs_cid: asset.ipfsCid,
    },
    contributor: {
      // Pseudonym only — never a name, email or filename (goal.md §12).
      anon_id: creator.anonId,
      kyc_status: creator.kycStatus,
      consent: consent
        ? {
            document_version: consent.documentVersion,
            document_sha256: consent.documentSha256,
            scopes: consent.scopes,
            accepted_at: consent.acceptedAt.toISOString(),
          }
        : null,
    },
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
    labels,
    chain: {
      chain_id: CHAIN_ID,
      ip_id: asset.ipId,
      cdr_vault_uuid: asset.cdrVaultUuid,
    },
    settlement: {
      payment_credited_at:
        (overrides.paymentCreditedAt ?? payout?.paymentCreditedAt ?? null)?.toISOString() ?? null,
    },
    takedown: overrides.takedown ?? null,
    provider_payload: overrides.providerPayload ?? {},
  };
}
