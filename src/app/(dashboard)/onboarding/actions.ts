"use server";

import { redirect } from "next/navigation";

import {
  acceptCurrentConsent,
  createCreatorWithConsent,
} from "@/lib/consent/service";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export async function onboardAction(formData: FormData): Promise<void> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();
  const accepted = formData.get("accept") === "on";
  if (!displayName || !accepted) return;

  const existing = await getCurrentCreator();
  if (existing) {
    await acceptCurrentConsent(existing.id);
  } else {
    await createCreatorWithConsent({
      displayName,
      walletAddress: walletAddress || undefined,
    });
  }
  redirect("/upload");
}

export async function acceptLatestConsentAction(): Promise<void> {
  const creator = await getCurrentCreator();
  if (creator) await acceptCurrentConsent(creator.id);
  redirect("/upload");
}
