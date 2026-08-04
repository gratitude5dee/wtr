/**
 * Wallet sign-in verification. `verifyMessage` recovers the signer from the
 * signature locally — no RPC, no gas. A creator row is looked up by wallet;
 * if none exists, sign-in still succeeds cryptographically and the caller
 * routes the new wallet to onboarding (consent must come before an account,
 * so the account is never auto-created here).
 */
import { verifyMessage } from "viem";

import { db, type Queryable } from "../db/pool";
import { signInMessage } from "./session";

/** Bad input, safe to echo to the caller. */
export class AuthError extends Error {}

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function verifyWalletSignIn(params: {
  address: string;
  signature: string;
  nonce: string;
}): Promise<`0x${string}`> {
  if (!WALLET_ADDRESS.test(params.address)) throw new AuthError("invalid wallet address");
  if (!/^0x[0-9a-fA-F]+$/.test(params.signature)) throw new AuthError("invalid signature");

  const valid = await verifyMessage({
    address: params.address as `0x${string}`,
    message: signInMessage(params.address, params.nonce),
    signature: params.signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) throw new AuthError("signature does not match this wallet");

  return params.address.toLowerCase() as `0x${string}`;
}

export async function creatorIdForWallet(
  wallet: string,
  q: Queryable = db,
): Promise<string | null> {
  const rows = await q.query<{ id: string }>(
    "SELECT id FROM creator WHERE lower(wallet_address) = lower($1) ORDER BY created_at ASC LIMIT 1",
    [wallet],
  );
  return rows.rows[0]?.id ?? null;
}
