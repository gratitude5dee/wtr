/**
 * Stage 4 — LISTED.
 *
 * Publishes an ask against the already-registered `licenseTermsId`. The price is
 * a `bigint` wei amount from end to end; it is only ever formatted at a render
 * boundary (goal.md §12).
 */
import { log } from "../../log";
import { WIP_TOKEN_ADDRESS } from "../../../../config/chain";
import type { LicensePreset } from "../../story/license-presets";
import type { StageDeps } from "../deps";
import { hasEvent } from "../store";
import { EVENT, type StageHandler, type StageResult } from "../types";

export function createListHandler(deps: StageDeps): StageHandler {
  return async function list(assetId: string): Promise<StageResult> {
    const asset = await deps.store.getAsset(assetId);
    if (!asset) throw new Error(`Unknown asset ${assetId}`);
    const events = await deps.store.listEvents(assetId);

    if (hasEvent(events, EVENT.LISTED)) {
      return { stage: "LISTED", status: "skipped", performed: [], alreadyDone: ["list"], assetId };
    }
    if (!hasEvent(events, EVENT.CDR_VAULT_ALLOCATED)) {
      return {
        stage: "LISTED",
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: "StageOrderError", message: "asset is not fully registered (stage 3d missing)" },
      };
    }

    try {
      const labels = await deps.store.getLabels(assetId);
      const preset =
        ((labels["wtr:license_preset"] as LicensePreset | undefined) ?? deps.defaultLicensePreset);
      if (asset.licenseTermsId === null) {
        throw new Error("asset has no licenseTermsId — stage 3c did not complete");
      }

      const existing = await deps.store.getListing(assetId, preset);
      const priceWei = await deps.quotePriceWei({ assetId, licensePreset: preset });
      const listing =
        existing ??
        (await deps.store.createListing({
          assetId,
          licensePreset: preset,
          licenseTermsId: asset.licenseTermsId,
          priceWei,
          currencyAddress: WIP_TOKEN_ADDRESS,
        }));

      await deps.store.appendEvent({
        assetId,
        eventType: EVENT.LISTED,
        idempotencyKey: `list:${assetId}:${preset}`,
        payload: {
          listing_id: listing.id,
          license_preset: preset,
          license_terms_id: asset.licenseTermsId.toString(),
          // wei, base-10 string. Never a float, never pre-formatted.
          price_wei: listing.priceWei.toString(),
          currency: listing.currencyAddress,
        },
      });
      await deps.store.setStage(assetId, "LISTED");

      return { stage: "LISTED", status: "completed", performed: ["list"], alreadyDone: [], assetId };
    } catch (error) {
      const failure = error as Error;
      log.error("stage 4 list failed", { assetId, error: failure.message });
      return {
        stage: "LISTED",
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: failure.name, message: failure.message },
      };
    }
  };
}
