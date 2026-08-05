/**
 * Seeds a demo creator with assets across every pipeline stage so the app can
 * be previewed without signing in (set `WTR_DEMO_CREATOR=wtr_demo` to serve
 * it to signed-out visitors).
 *
 *   npm run seed:demo
 *
 * Idempotent — keyed on the creator anon_id and asset content hashes. This is
 * demonstration data only: nothing here represents a real on-chain
 * registration, Trace record, or payment. No tx hashes or chain identifiers
 * are fabricated.
 */
import { createHash } from "node:crypto";

import { ZERO_ADDRESS } from "../config/chain";
import {
  CURRENT_PRIVACY,
  CURRENT_SCOPES,
  CURRENT_TOS,
  documentSha256,
} from "../src/lib/consent/documents";
import { closePool, db } from "../src/lib/db/pool";
import { log } from "../src/lib/log";
import { toWei } from "../src/lib/money";

const DEMO_ANON_ID = "wtr_demo";

interface DemoAsset {
  filename: string;
  modality: "audio" | "video" | "image" | "threed" | "motion";
  mediaType: string;
  byteSize: number;
  stage: string;
  daysAgo: number;
  labels: Array<[string, string]>;
  listing?: { preset: string; priceIp: string; status: string };
  sales?: Array<{
    amountIp: string;
    daysAgo: number;
    payoutStatus: string;
    payoutRail?: "onchain" | "fiat";
  }>;
  events: Array<[string, number]>;
}

const ASSETS: DemoAsset[] = [
  {
    filename: "tape_loops_12-18.wav",
    modality: "audio",
    mediaType: "audio/wav",
    byteSize: 91_234_567,
    stage: "IN_TRAY",
    daysAgo: 2,
    labels: [],
    events: [["asset.ingested", 2]],
  },
  {
    filename: "field_recordings_reykjavik.flac",
    modality: "audio",
    mediaType: "audio/flac",
    byteSize: 402_113_004,
    stage: "LABELED",
    daysAgo: 6,
    labels: [
      ["genre", "field recording"],
      ["environment", "urban outdoor"],
    ],
    events: [
      ["asset.ingested", 6],
      ["asset.labeled", 5],
    ],
  },
  {
    filename: "brutalist_kitbash_v1.glb",
    modality: "threed",
    mediaType: "model/gltf-binary",
    byteSize: 45_123_456,
    stage: "LABELED",
    daysAgo: 9,
    labels: [
      ["category", "architecture"],
      ["polycount", "820k"],
    ],
    events: [
      ["asset.ingested", 9],
      ["asset.labeled", 8],
    ],
  },
  {
    filename: "voiceset_neutral_en_40min.wav",
    modality: "audio",
    mediaType: "audio/wav",
    byteSize: 401_234_567,
    stage: "FAILED_REGISTER",
    daysAgo: 12,
    labels: [["language", "en-US"]],
    events: [
      ["asset.ingested", 12],
      ["asset.labeled", 11],
      ["asset.register_failed", 10],
    ],
  },
  {
    filename: "nocturne_stack_master.wav",
    modality: "audio",
    mediaType: "audio/wav",
    byteSize: 812_345_678,
    stage: "LISTED",
    daysAgo: 30,
    labels: [
      ["genre", "ambient"],
      ["bpm", "72"],
    ],
    listing: { preset: "WTR-TRAIN-NONEXCLUSIVE", priceIp: "18", status: "active" },
    events: [
      ["asset.ingested", 30],
      ["asset.labeled", 29],
      ["asset.listed", 27],
    ],
  },
  {
    filename: "storefront_signage_pack_01.zip",
    modality: "image",
    mediaType: "application/zip",
    byteSize: 1_204_555_120,
    stage: "LISTED",
    daysAgo: 24,
    labels: [
      ["subject", "signage"],
      ["count", "412 photos"],
    ],
    listing: { preset: "WTR-TRAIN-NONEXCLUSIVE", priceIp: "42", status: "active" },
    events: [
      ["asset.ingested", 24],
      ["asset.labeled", 23],
      ["asset.listed", 21],
    ],
  },
  {
    filename: "fogline_hofn_4k.mov",
    modality: "video",
    mediaType: "video/quicktime",
    byteSize: 2_812_345_678,
    stage: "SETTLED",
    daysAgo: 60,
    labels: [
      ["resolution", "3840x2160"],
      ["duration", "14m 20s"],
    ],
    listing: { preset: "WTR-TRAIN-EXCLUSIVE", priceIp: "640", status: "sold" },
    sales: [
      { amountIp: "640", daysAgo: 20, payoutStatus: "credited", payoutRail: "onchain" },
    ],
    events: [
      ["asset.ingested", 60],
      ["asset.labeled", 58],
      ["asset.listed", 55],
      ["asset.sold", 20],
      ["asset.payout_credited", 20],
      ["asset.settled", 19],
    ],
  },
  {
    filename: "drum_stems_session_09.zip",
    modality: "audio",
    mediaType: "application/zip",
    byteSize: 3_401_998_223,
    stage: "SETTLED",
    daysAgo: 90,
    labels: [
      ["instrument", "drums"],
      ["stems", "24"],
    ],
    listing: { preset: "WTR-TRAIN-NONEXCLUSIVE", priceIp: "95", status: "sold" },
    sales: [
      { amountIp: "95", daysAgo: 65, payoutStatus: "paid", payoutRail: "onchain" },
      { amountIp: "95", daysAgo: 55, payoutStatus: "paid", payoutRail: "fiat" },
      { amountIp: "95", daysAgo: 48, payoutStatus: "failed", payoutRail: "fiat" },
      { amountIp: "95", daysAgo: 40, payoutStatus: "pending", payoutRail: "onchain" },
    ],
    events: [
      ["asset.ingested", 90],
      ["asset.labeled", 88],
      ["asset.listed", 85],
      ["asset.sold", 65],
      ["asset.sold", 55],
      ["asset.sold", 48],
      ["asset.sold", 40],
      ["asset.settled", 39],
    ],
  },
];

function demoSha(filename: string): string {
  return createHash("sha256").update(`wtr-demo:${filename}`).digest("hex");
}

/** Fixed anchor so every run produces identical timestamps (keeps re-runs idempotent). */
const ANCHOR = Date.UTC(2026, 7, 1);

function daysAgo(days: number): Date {
  return new Date(ANCHOR - days * 24 * 60 * 60 * 1000);
}

async function main() {
  const creatorResult = await db.query<{ id: string }>(
    `INSERT INTO creator (anon_id, display_name, avatar_seed, kyc_status, tax_status, payout_pref, lab_verified)
     VALUES ($1, 'Demo Creator', 'wtr-demo-seed', 'verified', 'submitted', 'onchain', TRUE)
     ON CONFLICT (anon_id) DO UPDATE
       SET display_name = EXCLUDED.display_name, lab_verified = TRUE
     RETURNING id`,
    [DEMO_ANON_ID],
  );
  const creatorId = creatorResult.rows[0].id;

  // The real current documents (version + hash), so `hasCurrentConsent` holds
  // for the demo creator and the preview isn't stuck on the stale-terms screen.
  const tosSha = await documentSha256(CURRENT_TOS);
  await db.query(
    `INSERT INTO consent_acceptance (creator_id, document_version, document_sha256, scopes, privacy_version, accepted_at)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM consent_acceptance WHERE creator_id = $1 AND document_version = $2
     )`,
    [
      creatorId,
      CURRENT_TOS.version,
      tosSha,
      JSON.stringify(CURRENT_SCOPES),
      CURRENT_PRIVACY.version,
      daysAgo(0),
    ],
  );
  // Same semantics as acceptCurrentConsent: older acceptances get revoked_at
  // stamped so only the current-version row is active.
  await db.query(
    `UPDATE consent_acceptance SET revoked_at = now()
     WHERE creator_id = $1 AND revoked_at IS NULL AND document_version <> $2`,
    [creatorId, CURRENT_TOS.version],
  );

  for (const spec of ASSETS) {
    const sha = demoSha(spec.filename);
    const assetResult = await db.query<{ id: string }>(
      `INSERT INTO asset (creator_id, stage, modality, media_type, filename, byte_size, content_sha256, created_at)
       VALUES ($1, $2::asset_stage, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (creator_id, content_sha256) DO UPDATE SET stage = EXCLUDED.stage
       RETURNING id`,
      [
        creatorId,
        spec.stage,
        spec.modality,
        spec.mediaType,
        spec.filename,
        spec.byteSize,
        sha,
        daysAgo(spec.daysAgo),
      ],
    );
    const assetId = assetResult.rows[0].id;

    let seq = 0;
    for (const [eventType, eventDaysAgo] of spec.events) {
      seq += 1;
      await db.query(
        `INSERT INTO asset_event (asset_id, seq, event_type, payload, idempotency_key, created_at)
         SELECT $1, $2, $3, '{"demo_seed": true}', $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM asset_event WHERE asset_id = $1 AND idempotency_key = $4
         )
         ON CONFLICT ON CONSTRAINT asset_event_seq_unique DO NOTHING`,
        // Keyed on the event itself, not its position, so editing the list
        // stays idempotent against an already-seeded database.
        [assetId, seq, eventType, `demo:${sha}:${eventType}:${eventDaysAgo}`, daysAgo(eventDaysAgo)],
      );
    }

    for (const [key, value] of spec.labels) {
      await db.query(
        `INSERT INTO asset_label (asset_id, namespace, key, value, source, confidence, confirmed_by_creator)
         VALUES ($1, 'wtr', $2, to_jsonb($3::text), 'human', 1.0, TRUE)
         ON CONFLICT (asset_id, namespace, key) DO NOTHING`,
        [assetId, key, value],
      );
    }

    let listingId: string | null = null;
    if (spec.listing) {
      const listingResult = await db.query<{ id: string }>(
        `INSERT INTO listing (asset_id, license_preset, license_terms_id, price_wei, currency_address, status)
         VALUES ($1, $2, 0, $3, $4, $5)
         ON CONFLICT (asset_id, license_preset) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [
          assetId,
          spec.listing.preset,
          toWei(spec.listing.priceIp).toString(),
          ZERO_ADDRESS,
          spec.listing.status,
        ],
      );
      listingId = listingResult.rows[0].id;
    }

    for (const sale of spec.sales ?? []) {
      const saleResult = await db.query<{ id: string }>(
        `INSERT INTO sale (asset_id, listing_id, buyer_anon_id, license_terms_id, amount_wei, currency_address, created_at)
         SELECT $1, $2, 'demo_lab_buyer', 0, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM sale WHERE asset_id = $1 AND buyer_anon_id = 'demo_lab_buyer' AND created_at = $5
         )
         RETURNING id`,
        [assetId, listingId, toWei(sale.amountIp).toString(), ZERO_ADDRESS, daysAgo(sale.daysAgo)],
      );
      const saleId = saleResult.rows[0]?.id;
      if (!saleId) continue;
      await db.query(
        `INSERT INTO payout (sale_id, creator_id, amount_wei, currency_address, status, rail, external_ref, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          saleId,
          creatorId,
          toWei(sale.amountIp).toString(),
          ZERO_ADDRESS,
          sale.payoutStatus,
          sale.payoutRail ?? "onchain",
          // Bank rail settles off-chain: a reference, never a fabricated tx hash.
          sale.payoutRail === "fiat" ? `demo-transfer-${sale.daysAgo}` : null,
          daysAgo(sale.daysAgo),
        ],
      );
    }

    log.info("demo asset seeded", { filename: spec.filename, stage: spec.stage });
  }

  log.info("seed-demo done", { anonId: DEMO_ANON_ID });
}

main()
  .catch((error) => {
    log.error("seed-demo failed", { error });
    process.exitCode = 1;
  })
  .finally(() => closePool());
