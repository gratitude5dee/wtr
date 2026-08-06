"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  issueSession,
  PENDING_WALLET_COOKIE,
  readPendingWallet,
  SESSION_COOKIE,
  sessionsEnabled,
} from "@/lib/auth/session";
import {
  acceptCurrentConsent,
  createCreatorWithConsent,
} from "@/lib/consent/service";
import { getActingCreator } from "@/lib/dashboard/queries";

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function onboardAction(formData: FormData): Promise<void> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const accepted = formData.get("accept") === "on";

  if (!displayName) redirect("/onboarding?error=name");
  if (!accepted) redirect("/onboarding?error=accept");

  // With sessions on, the wallet must be the one that proved key possession
  // at sign-in — the form's wallet field is only trusted in dev mode.
  let walletAddress: string | undefined;
  if (sessionsEnabled()) {
    const jar = await cookies();
    const pending = readPendingWallet(jar.get(PENDING_WALLET_COOKIE)?.value ?? "");
    if (!pending) redirect("/onboarding?error=wallet");
    walletAddress = pending as string;
  } else {
    const formWallet = String(formData.get("walletAddress") ?? "").trim();
    if (formWallet && !WALLET_ADDRESS.test(formWallet)) {
      redirect("/onboarding?error=wallet");
    }
    walletAddress = formWallet || undefined;
  }

  const existing = await getActingCreator();
  if (existing) {
    await acceptCurrentConsent(existing.id);
  } else {
    const creatorId = await createCreatorWithConsent({
      displayName,
      walletAddress,
      // Only the sessions path carries a SIWE-verified wallet; the dev-mode
      // form field is self-declared and proves nothing.
      walletVerified: sessionsEnabled(),
    });
    if (sessionsEnabled() && walletAddress) {
      const jar = await cookies();
      jar.set(SESSION_COOKIE, issueSession(creatorId, walletAddress), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
      jar.delete(PENDING_WALLET_COOKIE);
    }
  }
  redirect("/upload");
}

export async function acceptLatestConsentAction(): Promise<void> {
  const creator = await getActingCreator();
  if (creator) await acceptCurrentConsent(creator.id);
  redirect("/upload");
}
