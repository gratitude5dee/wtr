"use server";

import { revalidatePath } from "next/cache";

import { getActingCreator } from "@/lib/dashboard/queries";
import {
  closeRequest,
  RequestError,
  reviewSubmission,
  submitAsset,
  withdrawSubmission,
} from "@/lib/requests/service";

export interface SubmissionState {
  error: string | null;
}

export async function submitAssetAction(
  requestId: string,
  assetId: string,
): Promise<SubmissionState> {
  const creator = await getActingCreator();
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

export async function reviewSubmissionAction(
  requestId: string,
  submissionId: string,
  decision: "accepted" | "rejected",
): Promise<SubmissionState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account" };
  try {
    await reviewSubmission(creator.id, submissionId, decision);
  } catch (error) {
    if (error instanceof RequestError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/requests/${requestId}`);
  return { error: null };
}

export async function closeRequestAction(requestId: string): Promise<SubmissionState> {
  const creator = await getActingCreator();
  if (!creator) return { error: "no signed-in account" };
  try {
    await closeRequest(creator.id, requestId);
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
  const creator = await getActingCreator();
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
