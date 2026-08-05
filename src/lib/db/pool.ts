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
// Fixed session-level advisory lock key used to serialize database migrations.
const MIGRATION_LOCK_KEY = 4927;

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

export async function withMigrationLock<T>(fn: (sql: Queryable) => Promise<T>): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    return await fn({
      query: (sql, params) => client.query(sql, params ? [...params] : undefined),
    });
  } finally {
    let unlockError: unknown;
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    } catch (error) {
      unlockError = error;
    } finally {
      client.release(unlockError instanceof Error ? unlockError : undefined);
    }
  }
}

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
