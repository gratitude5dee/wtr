"use server";

import { revalidatePath } from "next/cache";

import { CatalogError, purchaseAsset } from "@/lib/catalog/service";
import { getActingCreator } from "@/lib/dashboard/queries";
import { log } from "@/lib/log";

export interface PurchaseState {
  error: string | null;
  settled: boolean;
}

export async function purchaseAction(assetId: string): Promise<PurchaseState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account", settled: false };

  try {
    const result = await purchaseAsset(
      { id: creator.id, anonId: creator.anonId, walletAddress: creator.walletAddress },
      assetId,
    );
    revalidatePath(`/catalog/${assetId}`);
    if (result.status === "failed") {
      // The stage handler recorded exactly which sub-steps completed; a retry
      // resumes rather than double-minting. The raw error stays in the log.
      log.error("purchase settle failed", {
        assetId,
        error: result.error?.message ?? "unknown",
      });
      return {
        error: "the purchase could not be completed — nothing was charged twice; try again",
        settled: false,
      };
    }
    return { error: null, settled: true };
  } catch (error) {
    if (error instanceof CatalogError) return { error: error.message, settled: false };
    log.error("purchase failed", { assetId, error: (error as Error).message });
    return { error: "the purchase failed — try again", settled: false };
  }
}
