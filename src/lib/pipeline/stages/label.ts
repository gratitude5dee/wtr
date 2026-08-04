/**
 * Stage 2 — LABELED.
 *
 * Persists proposed labels and advances the spine. Idempotent: once the
 * `asset.labeled` event exists the handler short-circuits, so a retry cannot
 * produce a second, conflicting label set.
 */
import { log } from "../../log";
import type { StageDeps } from "../deps";
import { hasEvent } from "../store";
import { EVENT, type StageHandler, type StageResult } from "../types";

export function createLabelHandler(deps: StageDeps): StageHandler {
  return async function label(assetId: string): Promise<StageResult> {
    const asset = await deps.store.getAsset(assetId);
    if (!asset) throw new Error(`Unknown asset ${assetId}`);
    const events = await deps.store.listEvents(assetId);

    if (hasEvent(events, EVENT.LABELED)) {
      return { stage: "LABELED", status: "skipped", performed: [], alreadyDone: ["label"], assetId };
    }
    if (!hasEvent(events, EVENT.INGESTED)) {
      return {
        stage: "LABELED",
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: "StageOrderError", message: "asset has not been ingested" },
      };
    }

    try {
      const labels = await deps.proposeLabels({
        assetId,
        mediaType: asset.mediaType,
        filename: asset.filename,
      });
      await deps.store.putLabels(assetId, labels);
      await deps.store.appendEvent({
        assetId,
        eventType: EVENT.LABELED,
        idempotencyKey: `label:${assetId}`,
        payload: { count: labels.length, keys: labels.map((entry) => `${entry.namespace}:${entry.key}`) },
      });
      await deps.store.setStage(assetId, "LABELED");

      return { stage: "LABELED", status: "completed", performed: ["label"], alreadyDone: [], assetId };
    } catch (error) {
      const failure = error as Error;
      log.error("stage 2 label failed", { assetId, error: failure.message });
      return {
        stage: "LABELED",
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: failure.name, message: failure.message },
      };
    }
  };
}
