import { db, type Queryable } from "../db/pool";

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

/**
 * Records that this wallet just proved key possession (a completed SIWE
 * verification). Only ever called from a verified sign-in path — a
 * self-declared address in settings must not reach this.
 */
export async function markWalletVerified(
  creatorId: string,
  wallet: string,
  q: Queryable = db,
): Promise<void> {
  await q.query(
    `UPDATE creator SET wallet_verified_at = now()
      WHERE id = $1 AND lower(wallet_address) = lower($2)`,
    [creatorId, wallet],
  );
}
