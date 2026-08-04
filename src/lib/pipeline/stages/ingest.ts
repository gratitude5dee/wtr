/**
 * Stage 1 — IN_TRAY.
 *
 * Verifies the bytes on disk actually hash to the `content_sha256` the asset row
 * claims, then records the ingest event. Plaintext bytes never leave this
 * function and are never logged (goal.md §12).
 */
import { sha256Bytes, stripHexPrefix } from "../../crypto/canonical";
import { log } from "../../log";
import type { StageDeps } from "../deps";
import { hasEvent } from "../store";
import { EVENT, type StageHandler, type StageResult } from "../types";

export function createIngestHandler(deps: StageDeps): StageHandler {
  return async function ingest(assetId: string): Promise<StageResult> {
    const asset = await deps.store.getAsset(assetId);
    if (!asset) throw new Error(`Unknown asset ${assetId}`);
    const events = await deps.store.listEvents(assetId);

    if (hasEvent(events, EVENT.INGESTED)) {
      return {
        stage: "IN_TRAY",
        status: "skipped",
        performed: [],
        alreadyDone: ["ingest"],
        assetId,
      };
    }

    try {
      const plaintext = await deps.ports.media.readPlaintext({
        assetId,
        filename: asset.filename ?? assetId,
      });
      const digest = stripHexPrefix(await sha256Bytes(plaintext));
      if (digest !== asset.contentSha256) {
        throw new Error(
          `content_sha256 mismatch: asset claims ${asset.contentSha256}, bytes hash to ${digest}`,
        );
      }

      await deps.store.appendEvent({
        assetId,
        eventType: EVENT.INGESTED,
        idempotencyKey: `ingest:${assetId}`,
        payload: {
          content_sha256: digest,
          byte_size: plaintext.byteLength,
          media_type: asset.mediaType,
        },
      });

      if (asset.duplicateClaimFlag) {
        // Cross-creator collision: never auto-reject, raise for human review.
        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.DUPLICATE_CLAIM_FLAGGED,
          idempotencyKey: `duplicate-claim:${assetId}`,
          payload: { content_sha256: digest, resolution: "pending_human_review" },
        });
        log.warn("duplicate claim flagged for human review", { assetId });
      }

      await deps.store.updateAssetProjection(assetId, { byteSize: plaintext.byteLength });
      await deps.store.setStage(assetId, "IN_TRAY");

      return { stage: "IN_TRAY", status: "completed", performed: ["ingest"], alreadyDone: [], assetId };
    } catch (error) {
      const failure = error as Error;
      log.error("stage 1 ingest failed", { assetId, error: failure.message });
      return {
        stage: "IN_TRAY",
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: failure.name, message: failure.message },
      };
    }
  };
}
