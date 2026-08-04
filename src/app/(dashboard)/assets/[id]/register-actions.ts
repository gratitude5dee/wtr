"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import { log } from "@/lib/log";
import { registerAsset, RegisterError } from "@/lib/register/service";

export interface RegisterState {
  error: string | null;
  registered: boolean;
}

export async function registerAssetAction(assetId: string): Promise<RegisterState> {
  const creator = await getCurrentCreator();
  if (!creator) return { error: "no creator account", registered: false };

  try {
    const results = await registerAsset(creator.id, assetId);
    const failed = results.find((result) => result.status === "failed");
    revalidatePath(`/assets/${assetId}`);
    if (failed) {
      // Sub-step progress is preserved; the same button retries by resuming.
      return {
        error: `registration stopped at ${failed.stage} — your progress is saved, retry to resume`,
        registered: false,
      };
    }
    return { error: null, registered: true };
  } catch (error) {
    if (error instanceof RegisterError) return { error: error.message, registered: false };
    log.error("register action failed", { assetId, error: (error as Error).message });
    return { error: "registration failed — try again", registered: false };
  }
}
