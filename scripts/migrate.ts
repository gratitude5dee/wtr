/** `npm run db:migrate` — applies every pending SQL migration. */
import { migrate } from "../src/lib/db/migrate";
import { closePool, withMigrationLock } from "../src/lib/db/pool";
import { redactText } from "../src/lib/log";

async function main(): Promise<void> {
  const applied = await withMigrationLock((sql) => migrate(sql));
  if (applied.length === 0) {
    console.log("no pending migrations");
  } else {
    for (const filename of applied) console.log(`applied ${filename}`);
  }
  await closePool();
}

main().catch((error) => {
  // Scrubbed: a connection error can echo the DSN, credentials and all.
  console.error(redactText(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
