"use server";

import { revalidatePath } from "next/cache";

import { getActingCreator } from "@/lib/dashboard/queries";
import { confirmLabel, removeLabel, setCreatorLabel } from "@/lib/labels/service";

export async function confirmLabelAction(assetId: string, labelId: string): Promise<void> {
  const creator = await getActingCreator();
  if (!creator) return;
  await confirmLabel(creator.id, assetId, labelId);
  revalidatePath(`/assets/${assetId}`);
}

export async function removeLabelAction(assetId: string, labelId: string): Promise<void> {
  const creator = await getActingCreator();
  if (!creator) return;
  await removeLabel(creator.id, assetId, labelId);
  revalidatePath(`/assets/${assetId}`);
}

export async function setLabelAction(assetId: string, formData: FormData): Promise<void> {
  const creator = await getActingCreator();
  if (!creator) return;
  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  // Default to the pipeline's namespace so corrections upsert over the
  // machine label instead of creating a parallel row.
  const namespace = String(formData.get("namespace") ?? "wtr").trim() || "wtr";
  if (!key || !value) return;
  await setCreatorLabel(creator.id, assetId, { namespace, key, value });
  revalidatePath(`/assets/${assetId}`);
}
