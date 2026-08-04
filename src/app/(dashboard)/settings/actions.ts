"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import { SettingsError, updateCreatorSettings } from "@/lib/settings/service";

export interface SettingsState {
  error: string | null;
  saved: boolean;
}

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const creator = await getCurrentCreator();
  if (!creator) return { error: "no creator account", saved: false };

  try {
    await updateCreatorSettings(creator.id, {
      displayName: String(formData.get("displayName") ?? ""),
      walletAddress: String(formData.get("walletAddress") ?? ""),
      payoutPref: String(formData.get("payoutPref") ?? ""),
      taxSubmitted: formData.get("taxSubmitted") === "on",
    });
  } catch (error) {
    if (error instanceof SettingsError) return { error: error.message, saved: false };
    throw error;
  }
  revalidatePath("/settings");
  return { error: null, saved: true };
}
