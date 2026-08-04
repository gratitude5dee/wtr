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
