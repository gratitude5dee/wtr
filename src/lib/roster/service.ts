/**
 * Roster actions: an agent, manager or label acts on behalf of the creators
 * whose `managed_by` points at them, plus their own account. Nothing here
 * mints or sells — it only sets the creator-owned labels (`wtr:license_preset`,
 * `wtr:ask_price_wei`) the listing path already reads, so a bulk action can
 * never bypass the license flow.
 */
import { db, type Queryable } from "../db/pool";
import { toWei } from "../money";
import { LICENSE_PRESETS } from "../story/license-presets";

/** Bad input, safe to echo to the caller. */
export class RosterError extends Error {}

export interface RosterCreator {
  id: string;
  anonId: string;
  displayName: string | null;
}

/** The acting creator plus everyone who has named them as their manager. */
export async function listRoster(
  actingCreatorId: string,
  q: Queryable = db,
): Promise<RosterCreator[]> {
  const rows = await q.query<{ id: string; anon_id: string; display_name: string | null }>(
    `SELECT id, anon_id, display_name FROM creator
     WHERE id = $1 OR managed_by = $1
     ORDER BY (id = $1) DESC, anon_id ASC`,
    [actingCreatorId],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    anonId: row.anon_id,
    displayName: row.display_name,
  }));
}

export interface BulkApply {
  assetIds: string[];
  licensePreset: string | null;
  askPriceIp: string | null;
  /** Plain `key: value` label pairs, applied in the `wtr` namespace. */
  labels: Array<{ key: string; value: string }>;
}

export interface BulkApplyResult {
  applied: number;
  skipped: number;
}

/** Stages during which labels and license choices may still change. */
const EDITABLE_STAGES = ["IN_TRAY", "LABELED"] as const;

const LABEL_UPSERT = `
  INSERT INTO asset_label (asset_id, namespace, key, value, source, confidence, confirmed_by_creator)
  VALUES ($1, 'wtr', $2, to_jsonb($3::text), 'creator', 1.0, TRUE)
  ON CONFLICT ON CONSTRAINT asset_label_unique DO UPDATE
    SET value = EXCLUDED.value, source = 'creator', confidence = 1.0,
        model_id = NULL, confirmed_by_creator = TRUE`;

/**
 * Batch-applies labels and a license choice to already-registered assets in
 * the acting creator's roster. Assets past the editable stages are counted as
 * skipped rather than failing the whole batch.
 */
export async function batchApply(
  actingCreatorId: string,
  input: BulkApply,
  q: Queryable = db,
): Promise<BulkApplyResult> {
  if (input.assetIds.length === 0) throw new RosterError("select at least one asset");
  if (
    input.licensePreset !== null &&
    !(LICENSE_PRESETS as readonly string[]).includes(input.licensePreset)
  ) {
    throw new RosterError("unknown license preset");
  }

  let askPriceWei: bigint | null = null;
  if (input.askPriceIp !== null && input.askPriceIp.trim() !== "") {
    try {
      askPriceWei = toWei(input.askPriceIp.trim());
    } catch {
      throw new RosterError("price must be a decimal number");
    }
    if (askPriceWei <= 0n) throw new RosterError("price must be greater than zero");
  }
  if (input.licensePreset !== null && askPriceWei === null) {
    throw new RosterError("a license choice needs an ask price");
  }

  const owned = await q.query<{ id: string; stage: string }>(
    `SELECT a.id, a.stage::text AS stage
     FROM asset a JOIN creator c ON c.id = a.creator_id
     WHERE a.id = ANY($1::uuid[]) AND (c.id = $2 OR c.managed_by = $2)`,
    [input.assetIds, actingCreatorId],
  );
  const editable = owned.rows.filter((row) =>
    (EDITABLE_STAGES as readonly string[]).includes(row.stage),
  );

  for (const asset of editable) {
    for (const label of input.labels) {
      const key = label.key.trim();
      const value = label.value.trim();
      if (!key || !value) continue;
      await q.query(LABEL_UPSERT, [asset.id, key, value]);
    }
    if (input.licensePreset !== null && askPriceWei !== null) {
      await q.query(LABEL_UPSERT, [asset.id, "license_preset", input.licensePreset]);
      await q.query(LABEL_UPSERT, [asset.id, "ask_price_wei", askPriceWei.toString()]);
    }
  }

  return {
    applied: editable.length,
    skipped: input.assetIds.length - editable.length,
  };
}
