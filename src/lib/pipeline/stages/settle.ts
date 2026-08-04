/**
 * Stage 5 — SOLD → SETTLED.
 *
 * Three sub-steps, each guarded by its own event so a retry resumes:
 *   sale     mint license tokens for the buyer (fee is a LIVE read, never hardcoded)
 *   payout   credit the creator and promote `payment_credited_at` to Trace
 *   settle   close the asset out
 *
 * `payment_credited_at` is one of the few fields in the promoted subset, so the
 * payout step performs a FULL-STATE Trace metadata update chained onto the
 * previous root — and only after that succeeds is the promoted event appended,
 * so a failed promotion is retried rather than silently lost.
 */
import { log } from "../../log";
import { stableBatchId } from "../../trace/client";
import { toSha256Ref } from "../../trace/schema";
import type { StageDeps } from "../deps";
import { hasEvent, lastTraceSeq } from "../store";
import { buildTraceDocument } from "../trace-document";
import { EVENT, type StageHandler, type StageResult } from "../types";

export function createSettleHandler(deps: StageDeps): StageHandler {
  return async function settle(assetId: string): Promise<StageResult> {
    const asset = await deps.store.getAsset(assetId);
    if (!asset) throw new Error(`Unknown asset ${assetId}`);
    const events = await deps.store.listEvents(assetId);

    if (hasEvent(events, EVENT.SETTLED)) {
      return {
        stage: "SETTLED",
        status: "skipped",
        performed: [],
        alreadyDone: ["sale", "payout", "settle"],
        assetId,
      };
    }
    if (!hasEvent(events, EVENT.LISTED)) {
      return {
        stage: "SOLD",
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: "StageOrderError", message: "asset is not listed" },
      };
    }

    const alreadyDone: string[] = [];
    if (hasEvent(events, EVENT.SOLD)) alreadyDone.push("sale");
    if (hasEvent(events, EVENT.PAYOUT_CREDITED)) alreadyDone.push("payout");

    const performed: string[] = [];
    try {
      if (asset.ipId === null || asset.licenseTermsId === null) {
        throw new Error("asset is missing ipId / licenseTermsId");
      }
      const listing = await deps.store.getListing(
        assetId,
        (await deps.store.getLabels(assetId))["wtr:license_preset"] as string ??
          deps.defaultLicensePreset,
      );

      // ------------------------------------------------------------- sale
      let sale = await deps.store.getSale(assetId);
      if (!alreadyDone.includes("sale")) {
        // Live fee read — goal.md §12 forbids hardcoded fees.
        const feeWei = await deps.ports.settlement.predictMintingFeeWei({
          ipId: asset.ipId,
          licenseTermsId: asset.licenseTermsId,
        });
        const minted = await deps.ports.settlement.mintLicenseTokens({
          ipId: asset.ipId,
          licenseTermsId: asset.licenseTermsId,
          amount: 1,
          maxMintingFeeWei: feeWei,
          receiver: deps.buyer.receiver,
        });
        sale = await deps.store.recordSale({
          assetId,
          listingId: listing?.id ?? null,
          buyerAnonId: deps.buyer.anonId,
          licenseTermsId: asset.licenseTermsId,
          licenseTokenIds: minted.licenseTokenIds,
          amountWei: listing?.priceWei ?? feeWei,
          currencyAddress: listing?.currencyAddress ?? ("0x" as `0x${string}`),
          txHash: minted.txHash,
        });
        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.SOLD,
          idempotencyKey: `sale:${assetId}`,
          payload: {
            sale_id: sale.id,
            license_token_ids: minted.licenseTokenIds.map(String),
            minting_fee_wei: feeWei.toString(),
            amount_wei: sale.amountWei.toString(),
            tx_hash: minted.txHash,
          },
        });
        await deps.store.setStage(assetId, "SOLD");
        performed.push("sale");
      }
      if (!sale) throw new Error("sale row missing after sale sub-step");

      // ----------------------------------------------------------- payout
      if (!alreadyDone.includes("payout")) {
        const creditedAt = deps.now();
        const payout = await deps.store.creditPayout({
          saleId: sale.id,
          creatorId: asset.creatorId,
          amountWei: sale.amountWei,
          currencyAddress: sale.currencyAddress,
          paymentCreditedAt: creditedAt,
        });

        // Promoted subset: payment_credited_at. Full state, chained root.
        const document = await buildTraceDocument(deps.store, assetId, {
          paymentCreditedAt: creditedAt,
          providerPayload: { stage: "SETTLED", sale_ref: sale.id },
        });
        if (!asset.traceDataId || !asset.traceMetadataRoot) {
          throw new Error("cannot promote to Trace before stage 3b registered a data_id");
        }
        const batchId = await stableBatchId({
          action: "trace.payment_credited",
          assetId,
          saleId: sale.id,
        });
        // Assets registered before the sha256: canonical form stored 0x roots;
        // normalize so their payouts still chain correctly.
        const prevMetadataRoot = toSha256Ref(asset.traceMetadataRoot);
        const updated = await deps.ports.trace.updateMetadata({
          dataId: asset.traceDataId,
          document,
          prevMetadataRoot,
          updateCount: asset.traceUpdateCount,
          occurredAt: creditedAt.toISOString(),
          batchId,
        });

        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.PAYOUT_CREDITED,
          idempotencyKey: `payout:${assetId}:${sale.id}`,
          promotedToTrace: true,
          traceSeq: lastTraceSeq(events) + 1,
          payload: {
            payout_id: payout.id,
            amount_wei: payout.amountWei.toString(),
            payment_credited_at: creditedAt.toISOString(),
            prev_metadata_root: prevMetadataRoot,
            metadata_root: updated.metadataRoot,
            batch_id: batchId,
            ...(deps.ports.trace.mock ? { trace_mock: true } : {}),
          },
        });
        await deps.store.updateAssetProjection(assetId, {
          traceMetadataRoot: updated.metadataRoot,
          traceUpdateCount: updated.updateCount,
        });
        performed.push("payout");
      }

      // ----------------------------------------------------------- settle
      await deps.store.appendEvent({
        assetId,
        eventType: EVENT.SETTLED,
        idempotencyKey: `settle:${assetId}`,
        payload: { sale_id: sale.id },
      });
      await deps.store.setStage(assetId, "SETTLED");
      performed.push("settle");

      return { stage: "SETTLED", status: "completed", performed, alreadyDone, assetId };
    } catch (error) {
      const failure = error as Error;
      log.error("stage 5 settle failed", { assetId, error: failure.message });
      return {
        stage: performed.includes("sale") || alreadyDone.includes("sale") ? "SOLD" : "LISTED",
        status: "failed",
        performed,
        alreadyDone,
        assetId,
        error: { name: failure.name, message: failure.message },
      };
    }
  };
}
