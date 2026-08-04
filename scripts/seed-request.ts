/**
 * Seeds a lab data request for development, until the buyer-side API exists.
 *
 *   npm run seed:request -- "Field recordings, non-exclusive" WTR-TRAIN-NONEXCLUSIVE 25
 *
 * The last argument is the budget in IP (converted to wei here; money stays
 * bigint everywhere else).
 */
import { closePool, db } from "../src/lib/db/pool";
import { log } from "../src/lib/log";
import { toWei } from "../src/lib/money";
import { LICENSE_PRESETS } from "../src/lib/story/license-presets";

async function main(): Promise<void> {
  const [title, preset, budgetIp] = process.argv.slice(2);
  if (!title || !preset || !budgetIp) {
    throw new Error('usage: npm run seed:request -- "Title" WTR-TRAIN-NONEXCLUSIVE 25');
  }
  if (!(LICENSE_PRESETS as readonly string[]).includes(preset)) {
    throw new Error(`unknown preset ${preset}; one of: ${LICENSE_PRESETS.join(", ")}`);
  }

  const rows = await db.query<{ id: string }>(
    `INSERT INTO data_request (requester_anon_id, title, spec, license_preset, budget_wei)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING id`,
    [
      "anon-dev-lab",
      title,
      JSON.stringify({ modality: "any", notes: "development seed" }),
      preset,
      toWei(budgetIp).toString(),
    ],
  );
  log.info("data request seeded", { id: rows.rows[0].id, title, preset });
  await closePool();
}

main().catch((error: Error) => {
  log.error("seed-request failed", { error: error.message });
  process.exit(1);
});
