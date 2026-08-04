"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import { RequestError, submitAsset, withdrawSubmission } from "@/lib/requests/service";

export interface SubmissionState {
  error: string | null;
}

export async function submitAssetAction(
  requestId: string,
  assetId: string,
): Promise<SubmissionState> {
  const creator = await getCurrentCreator();
  if (!creator) return { error: "no creator account" };
  try {
    await submitAsset(creator.id, requestId, assetId);
  } catch (error) {
    if (error instanceof RequestError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/requests/${requestId}`);
  return { error: null };
}

export async function withdrawSubmissionAction(
  requestId: string,
  assetId: string,
): Promise<SubmissionState> {
  const creator = await getCurrentCreator();
  if (!creator) return { error: "no creator account" };
  try {
    await withdrawSubmission(creator.id, requestId, assetId);
  } catch (error) {
    if (error instanceof RequestError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/requests/${requestId}`);
  return { error: null };
}
