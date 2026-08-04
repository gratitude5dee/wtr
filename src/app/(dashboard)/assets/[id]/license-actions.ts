"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import { LicenseChoiceError, setLicenseChoice } from "@/lib/listing/service";

export interface LicenseChoiceState {
  error: string | null;
  saved: boolean;
}

export async function chooseLicenseAction(
  assetId: string,
  _prev: LicenseChoiceState,
  formData: FormData,
): Promise<LicenseChoiceState> {
  const creator = await getCurrentCreator();
  if (!creator) return { error: "no creator account", saved: false };

  const preset = String(formData.get("preset") ?? "");
  const askPriceIp = String(formData.get("askPriceIp") ?? "");
  try {
    await setLicenseChoice(creator.id, assetId, { preset, askPriceIp });
  } catch (error) {
    if (error instanceof LicenseChoiceError) return { error: error.message, saved: false };
    throw error;
  }
  revalidatePath(`/assets/${assetId}`);
  return { error: null, saved: true };
}
