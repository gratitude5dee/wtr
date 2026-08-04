/**
 * Minimal forward-only migration runner: every `db/migrations/*.sql` file is
 * applied once, in filename order, inside a transaction.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Queryable } from "./pool";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

async function ensureMigrationsTable(sql: Queryable): Promise<void> {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function pendingMigrations(sql: Queryable, dir = MIGRATIONS_DIR): Promise<string[]> {
  await ensureMigrationsTable(sql);
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const { rows } = await sql.query<{ filename: string }>("SELECT filename FROM schema_migration");
  const applied = new Set(rows.map((row) => row.filename));
  return files.filter((file) => !applied.has(file));
}

export async function migrate(sql: Queryable, dir = MIGRATIONS_DIR): Promise<string[]> {
  const pending = await pendingMigrations(sql, dir);
  for (const filename of pending) {
    const contents = await readFile(path.join(dir, filename), "utf8");
    await sql.query("BEGIN");
    try {
      await sql.query(contents);
      await sql.query("INSERT INTO schema_migration (filename) VALUES ($1)", [filename]);
      await sql.query("COMMIT");
    } catch (error) {
      await sql.query("ROLLBACK");
      throw new Error(`Migration ${filename} failed: ${(error as Error).message}`);
    }
  }
  return pending;
}
