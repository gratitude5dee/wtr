import { NextRequest, NextResponse } from "next/server";

import { AuthError, creatorIdForWallet, verifyWalletSignIn } from "@/lib/auth/service";
import {
  issuePendingWallet,
  issueSession,
  NONCE_COOKIE,
  PENDING_WALLET_COOKIE,
  readNonce,
  SESSION_COOKIE,
  sessionsEnabled,
} from "@/lib/auth/session";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sessionsEnabled()) {
    return NextResponse.json({ error: "sessions are not configured" }, { status: 501 });
  }
  try {
    const nonceCookie = request.cookies.get(NONCE_COOKIE)?.value ?? "";
    const nonce = readNonce(nonceCookie);
    if (!nonce) {
      return NextResponse.json({ error: "sign-in expired — try again" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      address?: string;
      signature?: string;
    } | null;
    if (!body?.address || !body.signature) {
      return NextResponse.json({ error: "address and signature required" }, { status: 400 });
    }

    const wallet = await verifyWalletSignIn({
      address: body.address,
      signature: body.signature,
      nonce,
    });
    const creatorId = await creatorIdForWallet(wallet);

    const response = NextResponse.json({
      // No account yet → the client routes to onboarding, where consent
      // comes before account creation.
      onboarded: creatorId !== null,
      wallet,
    });
    response.cookies.delete(NONCE_COOKIE);
    if (creatorId !== null) {
      response.cookies.set(SESSION_COOKIE, issueSession(creatorId, wallet), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    } else {
      response.cookies.set(PENDING_WALLET_COOKIE, issuePendingWallet(wallet), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 60,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    log.error("wallet sign-in failed", { error: (error as Error).message });
    return NextResponse.json({ error: "sign-in failed — try again" }, { status: 500 });
  }
}
