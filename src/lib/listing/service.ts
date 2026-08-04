/**
 * License choice ahead of registration (goal.md P0-4/P0-5). The choice is
 * stored as creator labels — `wtr:license_preset` is exactly what the stage-4
 * list handler reads, and `wtr:ask_price_wei` is the ask in wei (a base-10
 * string; money stays bigint until the render boundary).
 */
import { db } from "../db/pool";
import { toWei } from "../money";
import { LICENSE_PRESETS, type LicensePreset } from "../story/license-presets";

/** Bad input, safe to echo to the caller. */
export class LicenseChoiceError extends Error {}

const CHOICE_STAGES = ["IN_TRAY", "LABELED"] as const;

export async function setLicenseChoice(
  creatorId: string,
  assetId: string,
  input: { preset: string; askPriceIp: string },
): Promise<void> {
  if (!(LICENSE_PRESETS as readonly string[]).includes(input.preset)) {
    throw new LicenseChoiceError("unknown license preset");
  }
  const preset = input.preset as LicensePreset;

  let askPriceWei: bigint;
  try {
    askPriceWei = toWei(input.askPriceIp.trim());
  } catch {
    throw new LicenseChoiceError("price must be a decimal number");
  }
  if (askPriceWei <= 0n) throw new LicenseChoiceError("price must be greater than zero");

  const owner = await db.query<{ stage: string }>(
    "SELECT stage::text AS stage FROM asset WHERE id = $1 AND creator_id = $2",
    [assetId, creatorId],
  );
  if (!owner.rows[0]) throw new LicenseChoiceError("asset not found");
  if (!(CHOICE_STAGES as readonly string[]).includes(owner.rows[0].stage)) {
    throw new LicenseChoiceError("license terms are fixed once the asset is registered");
  }

  const upsert = `
    INSERT INTO asset_label (asset_id, namespace, key, value, source, confidence, confirmed_by_creator)
    VALUES ($1, 'wtr', $2, to_jsonb($3::text), 'creator', 1.0, TRUE)
    ON CONFLICT ON CONSTRAINT asset_label_unique DO UPDATE
      SET value = EXCLUDED.value, source = 'creator', confidence = 1.0,
          model_id = NULL, confirmed_by_creator = TRUE`;
  await db.query(upsert, [assetId, "license_preset", preset]);
  await db.query(upsert, [assetId, "ask_price_wei", askPriceWei.toString()]);
}

export interface LicenseChoice {
  preset: LicensePreset | null;
  askPriceWei: bigint | null;
}

export async function getLicenseChoice(assetId: string): Promise<LicenseChoice> {
  const rows = await db.query<{ key: string; value: string }>(
    `SELECT key, value #>> '{}' AS value FROM asset_label
     WHERE asset_id = $1 AND namespace = 'wtr' AND key IN ('license_preset', 'ask_price_wei')`,
    [assetId],
  );
  let preset: LicensePreset | null = null;
  let askPriceWei: bigint | null = null;
  for (const row of rows.rows) {
    if (row.key === "license_preset" && (LICENSE_PRESETS as readonly string[]).includes(row.value)) {
      preset = row.value as LicensePreset;
    }
    if (row.key === "ask_price_wei") askPriceWei = BigInt(row.value);
  }
  return { preset, askPriceWei };
}
