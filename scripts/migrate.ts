/** `npm run db:migrate` — applies every pending SQL migration. */
import { migrate } from "../src/lib/db/migrate";
import { closePool, db } from "../src/lib/db/pool";

async function main(): Promise<void> {
  const applied = await migrate(db);
  if (applied.length === 0) {
    console.log("no pending migrations");
  } else {
    for (const filename of applied) console.log(`applied ${filename}`);
  }
  await closePool();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
