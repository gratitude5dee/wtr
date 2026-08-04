"use server";

import { redirect } from "next/navigation";

import {
  acceptCurrentConsent,
  createCreatorWithConsent,
} from "@/lib/consent/service";
import { getCurrentCreator } from "@/lib/dashboard/queries";

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function onboardAction(formData: FormData): Promise<void> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();
  const accepted = formData.get("accept") === "on";

  if (!displayName) redirect("/onboarding?error=name");
  if (!accepted) redirect("/onboarding?error=accept");
  if (walletAddress && !WALLET_ADDRESS.test(walletAddress)) {
    redirect("/onboarding?error=wallet");
  }

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
