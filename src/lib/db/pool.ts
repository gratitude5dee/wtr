/**
 * Postgres access. Everything the pipeline touches goes through the narrow
 * {@link Queryable} interface so stage handlers can be exercised against an
 * in-memory fake in tests without a database.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { DATABASE_URL } from "../../../config/env";

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL(), max: 8 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}

export const db: Queryable = {
  query: (sql, params) => getPool().query(sql, params ? [...params] : undefined),
};

/** Run `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn({
      query: (sql, params) => client.query(sql, params ? [...params] : undefined),
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
