"use server";

import { revalidatePath } from "next/cache";

import { getActingCreator } from "@/lib/dashboard/queries";
import { batchApply, RosterError } from "@/lib/roster/service";
import type { ManifestEntry } from "@/lib/upload/manifest";

export interface BulkActionState {
  error: string | null;
  message: string | null;
}

/** Applies a license choice and labels to every selected asset at once. */
export async function bulkApplyAction(
  _prev: BulkActionState,
  formData: FormData,
): Promise<BulkActionState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account", message: null };

  const assetIds = formData.getAll("assetId").map(String);
  const licensePreset = String(formData.get("licensePreset") ?? "").trim() || null;
  const askPriceIp = String(formData.get("askPriceIp") ?? "").trim() || null;
  const labelKey = String(formData.get("labelKey") ?? "").trim();
  const labelValue = String(formData.get("labelValue") ?? "").trim();

  try {
    const result = await batchApply(creator.id, {
      assetIds,
      licensePreset,
      askPriceIp,
      labels: labelKey && labelValue ? [{ key: labelKey, value: labelValue }] : [],
    });
    revalidatePath("/assets");
    return {
      error: null,
      message:
        result.skipped > 0
          ? `Applied to ${result.applied} — ${result.skipped} skipped (already registered).`
          : `Applied to ${result.applied}.`,
    };
  } catch (error) {
    if (error instanceof RosterError) return { error: error.message, message: null };
    throw error;
  }
}

/** Applies one manifest row to a freshly registered asset (bulk upload). */
export async function applyManifestEntryAction(
  assetId: string,
  entry: ManifestEntry,
): Promise<{ error: string | null }> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account" };
  try {
    await batchApply(creator.id, {
      assetIds: [assetId],
      licensePreset: entry.license_preset ?? null,
      askPriceIp: entry.price_ip ?? null,
      labels: Object.entries(entry.labels ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    });
  } catch (error) {
    if (error instanceof RosterError) return { error: error.message };
    throw error;
  }
  return { error: null };
}
