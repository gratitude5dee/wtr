/**
 * `npm run e2e -- path/to/audio.wav`
 *
 * Phase 1 goal (goal.md §11): one real audio file from local disk traverses all
 * five stages — IN_TRAY → LABELED → REGISTERED → LISTED → SOLD/SETTLED —
 * against Aeneid and Trace staging, with NO UI. Afterwards it exercises the CDR
 * license read path so the licence is proven to actually unlock the data.
 *
 * Prints `data_id`, `ipId`, CDR vault `uuid`, IPFS `cid` and `licenseTermsId`.
 * Never prints media bytes, key material or secrets (goal.md §12).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClients } from "../src/lib/chain/clients";
import { encodeLicenseAccessAuxData } from "../src/lib/chain/conditions";
import { sha256Bytes, stripHexPrefix } from "../src/lib/crypto/canonical";
import { closePool, db } from "../src/lib/db/pool";
import { log, redactText } from "../src/lib/log";
import { createStageHandlers, runPipeline } from "../src/lib/pipeline";
import { createPorts } from "../src/lib/pipeline/adapters";
import { PgAssetStore } from "../src/lib/pipeline/pg-store";
import type { LicensePreset } from "../src/lib/story/license-presets";
import { createTraceClient, isTraceMock } from "../src/lib/trace/factory";
import { WIP_TOKEN_ADDRESS } from "../config/chain";

const PRESET: LicensePreset = "WTR-TRAIN-NONEXCLUSIVE";
const ASK_PRICE_WEI = 10_000_000_000_000_000n; // 0.01 $WIP

/** Creates the creator, consent acceptance and asset row for a local file. */
async function seedAsset(filePath: string): Promise<{ assetId: string; filename: string }> {
  const filename = path.basename(filePath);
  const bytes = new Uint8Array(await readFile(filePath));
  const contentSha256 = stripHexPrefix(await sha256Bytes(bytes));

  const anonId = `anon-e2e-${contentSha256.slice(0, 12)}`;
  const creator = await db.query<{ id: string }>(
    `INSERT INTO creator (anon_id, kyc_status, kyc_updated_at)
     VALUES ($1, 'verified', now())
     ON CONFLICT (anon_id) DO UPDATE SET kyc_status = 'verified'
     RETURNING id`,
    [anonId],
  );
  const creatorId = creator.rows[0].id;

  // Consent is append-only: this is a new acceptance row, never an update.
  await db.query(
    `INSERT INTO consent_acceptance (creator_id, document_version, document_sha256, scopes)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      creatorId,
      "wtr-consent-2026-01",
      stripHexPrefix(await sha256Bytes(new TextEncoder().encode("wtr-consent-2026-01"))),
      JSON.stringify({ ai_training: true, resale: true }),
    ],
  );

  const asset = await db.query<{ id: string }>(
    `INSERT INTO asset (creator_id, media_type, filename, byte_size, content_sha256)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (creator_id, content_sha256) DO UPDATE SET filename = EXCLUDED.filename
     RETURNING id`,
    [creatorId, "audio/wav", filename, bytes.byteLength, contentSha256],
  );

  return { assetId: asset.rows[0].id, filename };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("usage: npm run e2e -- path/to/audio.wav");

  const clients = await createClients();
  const trace = createTraceClient();
  if (isTraceMock()) {
    log.warn("e2e running with TRACE MOCK: data_id below is simulated, not a real audit record");
  }
  const ports = createPorts({
    clients,
    trace,
    traceMock: isTraceMock(),
    mediaDir: path.dirname(path.resolve(filePath)),
  });
  const store = new PgAssetStore(db);

  const { assetId } = await seedAsset(path.resolve(filePath));
  log.info("seeded asset", { assetId });

  const handlers = createStageHandlers({
    store,
    ports,
    owner: clients.account.address,
    now: () => new Date(),
    proposeLabels: async () => [
      { namespace: "wtr", key: "license_preset", value: PRESET, source: "human" },
      { namespace: "wtr", key: "modality", value: "audio", source: "human" },
    ],
    quotePriceWei: async () => ASK_PRICE_WEI,
    buyer: { anonId: "anon-e2e-buyer", receiver: clients.account.address },
    defaultLicensePreset: PRESET,
  });

  const results = await runPipeline(handlers, assetId);
  for (const result of results) {
    console.log(
      `${result.stage.padEnd(16)} ${result.status}` +
        (result.performed.length ? ` performed=${result.performed.join(",")}` : "") +
        (result.error ? ` error=${result.error.name}: ${redactText(result.error.message)}` : ""),
    );
  }
  const failed = results.find((result) => result.status === "failed");
  if (failed) throw new Error(`pipeline stopped at ${failed.stage}: ${failed.error?.message}`);

  const asset = await store.getAsset(assetId);
  const sale = await store.getSale(assetId);
  if (!asset || !sale || !asset.ipId || asset.cdrVaultUuid === null) {
    throw new Error("pipeline completed but the projection is incomplete");
  }

  // ---------------------------------------------------------- read path
  // The licence must actually unlock the data: present the license token ids as
  // `accessAuxData` to the license-gated vault. The recovered key material is
  // counted, never printed.
  const accessAuxData = encodeLicenseAccessAuxData(sale.licenseTokenIds);
  const readFee = await clients.cdr.observer.getReadFee();
  const access = await clients.cdr.consumer.accessCDR({
    uuid: asset.cdrVaultUuid,
    accessAuxData,
    timeoutMs: 120_000,
  });
  console.log(
    `cdr read path ok: recovered ${access.dataKey.byteLength} bytes of key material ` +
      `(readFee=${readFee.toString()} wei)`,
  );

  console.log("--- phase 1 result ---");
  console.log(`data_id         = ${asset.traceDataId}`);
  console.log(`ipId            = ${asset.ipId}`);
  console.log(`cdr vault uuid  = ${asset.cdrVaultUuid}`);
  console.log(`ipfs cid        = ${asset.ipfsCid}`);
  console.log(`licenseTermsId  = ${asset.licenseTermsId?.toString()}`);
  console.log(`licenseTokenIds = ${sale.licenseTokenIds.map(String).join(",")}`);
  console.log(`price           = ${sale.amountWei.toString()} wei of ${WIP_TOKEN_ADDRESS}`);
  console.log(`stage           = ${asset.stage}`);

  await closePool();
}

main().catch(async (error) => {
  console.error(redactText(error instanceof Error ? error.message : String(error)));
  await closePool().catch(() => {});
  process.exit(1);
});
