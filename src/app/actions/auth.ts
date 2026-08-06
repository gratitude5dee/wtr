"use server";

import { cookies } from "next/headers";
import type { LoginPayload, VerifyLoginPayloadParams } from "thirdweb/auth";

import { creatorIdForWallet, markWalletVerified } from "@/lib/auth/service";
import {
  issueNonce,
  issuePendingWallet,
  issueSession,
  NONCE_COOKIE,
  PENDING_WALLET_COOKIE,
  readNonce,
  readPendingWallet,
  readSession,
  SESSION_COOKIE,
  walletAuthEnabled,
} from "@/lib/auth/session";
import { serverAuth } from "@/lib/auth/thirdweb";

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export async function generatePayload(params: {
  address: string;
  chainId?: number;
}): Promise<LoginPayload> {
  if (!walletAuthEnabled()) throw new Error("wallet auth is not configured");
  const payload = await serverAuth().generatePayload(params);
  const jar = await cookies();
  // Bind the nonce to the requesting wallet so this exact payload — and no
  // other — can complete the login, exactly once.
  jar.set(NONCE_COOKIE, issueNonce(payload.nonce, params.address), {
    ...COOKIE_BASE,
    maxAge: 600,
  });
  return payload;
}

export async function login(
  params: VerifyLoginPayloadParams,
): Promise<{ onboarded: boolean }> {
  if (!walletAuthEnabled()) throw new Error("wallet auth is not configured");
  const jar = await cookies();

  const bound = readNonce(jar.get(NONCE_COOKIE)?.value ?? "");
  if (
    !bound ||
    bound.nonce !== params.payload.nonce ||
    bound.address !== params.payload.address.toLowerCase()
  ) {
    throw new Error("sign-in expired — try again");
  }

  const result = await serverAuth().verifyPayload(params);
  // Consume the nonce whether or not verification succeeded.
  jar.set(NONCE_COOKIE, "", { ...COOKIE_BASE, maxAge: 0 });
  if (!result.valid) throw new Error("signature does not match this wallet");

  const wallet = result.payload.address.toLowerCase();
  const creatorId = await creatorIdForWallet(wallet);
  if (creatorId !== null) {
    // The signature just proved control of this address; that is the only
    // thing that may set the verification stamp.
    await markWalletVerified(creatorId, wallet);
    jar.set(SESSION_COOKIE, issueSession(creatorId, wallet), {
      ...COOKIE_BASE,
      maxAge: 7 * 24 * 60 * 60,
    });
    return { onboarded: true };
  }
  // No account yet: consent must come before an account, so the verified
  // wallet is carried into onboarding rather than auto-created here.
  jar.set(PENDING_WALLET_COOKIE, issuePendingWallet(wallet), {
    ...COOKIE_BASE,
    maxAge: 30 * 60,
  });
  return { onboarded: false };
}

export async function isLoggedIn(address: string): Promise<boolean> {
  if (!walletAuthEnabled()) return false;
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value ?? "");
  if (session && session.wallet === address.toLowerCase()) return true;
  // A verified wallet mid-onboarding counts as connected so the wallet UI
  // doesn't disconnect it before the consent step finishes.
  const pending = readPendingWallet(jar.get(PENDING_WALLET_COOKIE)?.value ?? "");
  return pending === address.toLowerCase();
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  // Explicit site-wide path: a pathless delete would scope the expiry cookie
  // to this route and leave the real session cookie alive.
  jar.set(SESSION_COOKIE, "", { ...COOKIE_BASE, maxAge: 0 });
  jar.set(PENDING_WALLET_COOKIE, "", { ...COOKIE_BASE, maxAge: 0 });
}
