import { NextRequest, NextResponse } from "next/server";

import { issueNonce, NONCE_COOKIE, sessionsEnabled, signInMessage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sessionsEnabled()) {
    return NextResponse.json({ error: "sessions are not configured" }, { status: 501 });
  }
  const body = (await request.json().catch(() => null)) as { address?: string } | null;
  if (!body?.address || !WALLET_ADDRESS.test(body.address)) {
    return NextResponse.json({ error: "wallet address required" }, { status: 400 });
  }
  const { nonce, cookieValue } = issueNonce();
  // The exact text to sign comes from the server so verification can rebuild
  // it byte-for-byte from (address, nonce).
  const response = NextResponse.json({ nonce, message: signInMessage(body.address, nonce) });
  response.cookies.set(NONCE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 600,
  });
  return response;
}
