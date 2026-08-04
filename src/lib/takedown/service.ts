/**
 * Takedown / withdrawal (goal.md P0-10). Withdrawing stops FUTURE sales:
 * listings close and the takedown lands in the event log (a Trace-promotable
 * event). It does NOT revoke licenses already minted, and decryptions already
 * granted cannot be recalled — the UI says so before the creator confirms.
 */
import { db, withTransaction } from "../db/pool";
import { PgAssetStore } from "../pipeline/pg-store";
import { EVENT } from "../pipeline/types";

/** Bad input, safe to echo to the caller. */
export class TakedownError extends Error {}

const MAX_REASON_LENGTH = 1000;

export async function withdrawAsset(
  creatorId: string,
  assetId: string,
  reason: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new TakedownError("a reason is required");
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new TakedownError(`reason must be at most ${MAX_REASON_LENGTH} characters`);
  }

  await withTransaction(async (tx) => {
    const owned = await tx.query<{ id: string }>(
      "SELECT id FROM asset WHERE id = $1 AND creator_id = $2",
      [assetId, creatorId],
    );
    if (!owned.rows[0]) throw new TakedownError("asset not found");

    const already = await tx.query<{ id: number }>(
      "SELECT seq AS id FROM asset_event WHERE asset_id = $1 AND event_type = $2",
      [assetId, EVENT.TAKEDOWN],
    );
    if (already.rows[0]) throw new TakedownError("this asset is already withdrawn");

    await tx.query(
      `UPDATE listing SET status = 'withdrawn'
       WHERE asset_id = $1 AND status IN ('active', 'paused')`,
      [assetId],
    );

    const store = new PgAssetStore(tx);
    await store.appendEvent({
      assetId,
      eventType: EVENT.TAKEDOWN,
      idempotencyKey: `takedown:${assetId}`,
      payload: {
        reason: trimmed,
        requested_at: new Date().toISOString(),
        // Honest scope, recorded permanently alongside the request.
        already_minted_licenses_remain_valid: true,
        prior_decryptions_not_recalled: true,
      },
    });
  });
}

export async function isWithdrawn(assetId: string): Promise<boolean> {
  const rows = await db.query<{ seq: number }>(
    "SELECT seq FROM asset_event WHERE asset_id = $1 AND event_type = $2",
    [assetId, EVENT.TAKEDOWN],
  );
  return rows.rows.length > 0;
}
