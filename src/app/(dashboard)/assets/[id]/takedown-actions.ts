"use server";

import { revalidatePath } from "next/cache";

import { getActingCreator } from "@/lib/dashboard/queries";
import { TakedownError, withdrawAsset } from "@/lib/takedown/service";

export interface TakedownState {
  error: string | null;
  done: boolean;
}

export async function withdrawAssetAction(
  assetId: string,
  _prev: TakedownState,
  formData: FormData,
): Promise<TakedownState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no creator account", done: false };

  const reason = String(formData.get("reason") ?? "");
  const acknowledged = formData.get("acknowledge") === "on";
  if (!acknowledged) {
    return { error: "you must acknowledge what withdrawal cannot undo", done: false };
  }
  try {
    await withdrawAsset(creator.id, assetId, reason);
  } catch (error) {
    if (error instanceof TakedownError) return { error: error.message, done: false };
    throw error;
  }
  revalidatePath(`/assets/${assetId}`);
  return { error: null, done: true };
}
