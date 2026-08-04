/**
 * Creator label review (goal.md P0-3). Provenance rules:
 * - a machine label keeps source='model', its confidence and model_id;
 * - a creator CONFIRMING it flips confirmed_by_creator without touching those;
 * - a creator EDITING or ADDING one becomes source='creator', confidence=1.0.
 */
import { db } from "../db/pool";

/** Stages during which labels may still change; registration seals them. */
const EDITABLE_STAGES = ["IN_TRAY", "LABELED"] as const;

async function assertOwnership(creatorId: string, assetId: string): Promise<void> {
  const owner = await db.query<{ stage: string }>(
    "SELECT stage::text AS stage FROM asset WHERE id = $1 AND creator_id = $2",
    [assetId, creatorId],
  );
  if (!owner.rows[0]) throw new Error("asset not found");
  if (!(EDITABLE_STAGES as readonly string[]).includes(owner.rows[0].stage)) {
    throw new Error("labels are sealed once the asset is registered");
  }
}

export async function confirmLabel(
  creatorId: string,
  assetId: string,
  labelId: string,
): Promise<void> {
  await assertOwnership(creatorId, assetId);
  await db.query(
    `UPDATE asset_label SET confirmed_by_creator = TRUE
     WHERE id = $1 AND asset_id = $2`,
    [labelId, assetId],
  );
}

export async function setCreatorLabel(
  creatorId: string,
  assetId: string,
  input: { namespace: string; key: string; value: string },
): Promise<void> {
  await assertOwnership(creatorId, assetId);
  await db.query(
    `INSERT INTO asset_label (asset_id, namespace, key, value, source, confidence, confirmed_by_creator)
     VALUES ($1, $2, $3, to_jsonb($4::text), 'creator', 1.0, TRUE)
     ON CONFLICT ON CONSTRAINT asset_label_unique DO UPDATE
       SET value = EXCLUDED.value,
           source = 'creator',
           confidence = 1.0,
           model_id = NULL,
           confirmed_by_creator = TRUE`,
    [assetId, input.namespace, input.key, input.value],
  );
}

export async function removeLabel(
  creatorId: string,
  assetId: string,
  labelId: string,
): Promise<void> {
  await assertOwnership(creatorId, assetId);
  await db.query("DELETE FROM asset_label WHERE id = $1 AND asset_id = $2", [labelId, assetId]);
}
