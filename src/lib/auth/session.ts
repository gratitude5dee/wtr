/**
 * Wallet sessions (goal.md P0-1). Sign-in is proof of key possession: the
 * browser signs a one-time server nonce with the creator's wallet, the server
 * verifies the signature and sets an HMAC-signed, httpOnly session cookie.
 * No password, no PII; the wallet address is the identity.
 *
 * Without `WTR_SESSION_SECRET` the app stays in single-creator dev mode —
 * `getCurrentCreator` falls back to the earliest creator row and no login is
 * required. This keeps local development working while making the production
 * posture explicit.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { SESSION_SECRET } from "../../../config/env";
import { CHAIN } from "../../../config/chain";

export const SESSION_COOKIE = "wtr-session";
export const NONCE_COOKIE = "wtr-auth-nonce";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;

export function sessionsEnabled(): boolean {
  return SESSION_SECRET() !== null;
}

function sign(payload: string): string {
  const secret = SESSION_SECRET();
  if (!secret) throw new Error("sessions are not configured");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function pack(payload: Record<string, string | number>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function unpack(token: string): Record<string, unknown> | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body);
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function issueNonce(): { nonce: string; cookieValue: string } {
  const nonce = randomBytes(16).toString("hex");
  return { nonce, cookieValue: pack({ nonce, exp: Date.now() + NONCE_TTL_MS }) };
}

export function readNonce(cookieValue: string): string | null {
  const payload = unpack(cookieValue);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return typeof payload.nonce === "string" ? payload.nonce : null;
}

/** The exact text the wallet signs. Human-readable on purpose. */
export function signInMessage(address: string, nonce: string): string {
  return [
    "WTR wants you to sign in with your wallet.",
    "",
    `Wallet: ${address}`,
    `Chain: ${CHAIN.name} (${CHAIN.id})`,
    `Nonce: ${nonce}`,
    "",
    "Signing costs nothing and sends no transaction.",
  ].join("\n");
}

export const PENDING_WALLET_COOKIE = "wtr-wallet-pending";
const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * A wallet that proved key possession but has no account yet: carried into
 * onboarding so the new account binds to the verified wallet, not to
 * whatever the form claims.
 */
export function issuePendingWallet(wallet: string): string {
  return pack({ wallet, exp: Date.now() + PENDING_TTL_MS });
}

export function readPendingWallet(cookieValue: string): string | null {
  const payload = unpack(cookieValue);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return typeof payload.wallet === "string" ? payload.wallet : null;
}

export function issueSession(creatorId: string, wallet: string): string {
  return pack({ creatorId, wallet, exp: Date.now() + SESSION_TTL_MS });
}

export function readSession(cookieValue: string): { creatorId: string; wallet: string } | null {
  const payload = unpack(cookieValue);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  if (typeof payload.creatorId !== "string" || typeof payload.wallet !== "string") return null;
  return { creatorId: payload.creatorId, wallet: payload.wallet };
}
