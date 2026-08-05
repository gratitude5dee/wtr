/**
 * The self-serve catalog (goal.md P0-6): every asset with an active listing,
 * browsable by any signed-in account. Buying mints a real license token on
 * Aeneid through the stage-5 settle handler — the same idempotent path the
 * e2e script exercises — so a purchase can never bypass the creator's terms,
 * and without a funded operator wallet the buy card reports honest blockers
 * instead of pretending to mint.
 */
import { MEDIA_DIR, TRACE_MODE } from "../../../config/env";
import { createClients } from "../chain/clients";
import { db, type Queryable } from "../db/pool";
import { weiFromDb } from "../money";
import { createStageHandlers, type StageResult } from "../pipeline";
import { createPorts } from "../pipeline/adapters";
import { PgAssetStore } from "../pipeline/pg-store";
import type { LicensePreset } from "../story/license-presets";
import { LICENSE_PRESETS } from "../story/license-presets";
import { createTraceClient, isTraceMock } from "../trace/factory";

/** Safe to echo to the buyer. */
export class CatalogError extends Error {}

export interface CatalogFilters {
  modality?: string;
  licensePreset?: string;
  /** Case-insensitive filename substring match. */
  search?: string;
  /** Only listings whose terms permit training. */
  trainingOnly?: boolean;
  /** Only work from KYC-verified creators. */
  kycOnly?: boolean;
}

export interface CatalogItem {
  assetId: string;
  filename: string | null;
  modality: string;
  previewUrl: string | null;
  licensePreset: string;
  priceWei: bigint;
  creatorAnonId: string;
  creatorKycStatus: string;
  listedAt: Date;
}

export async function listCatalog(
  filters: CatalogFilters = {},
  q: Queryable = db,
): Promise<CatalogItem[]> {
  const where: string[] = ["l.status = 'active'", "a.stage IN ('LISTED', 'SOLD', 'SETTLED')"];
  const params: string[] = [];
  if (filters.modality) {
    params.push(filters.modality);
    where.push(`a.modality = $${params.length}`);
  }
  if (filters.licensePreset) {
    params.push(filters.licensePreset);
    where.push(`l.license_preset = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`a.filename ILIKE $${params.length}`);
  }
  if (filters.trainingOnly) {
    where.push(`l.license_preset <> 'WTR-NO-TRAIN'`);
  }
  if (filters.kycOnly) {
    where.push(`c.kyc_status = 'verified'`);
  }
  const rows = await q.query<{
    asset_id: string;
    filename: string | null;
    modality: string;
    preview_url: string | null;
    license_preset: string;
    price_wei: string;
    creator_anon_id: string;
    creator_kyc_status: string;
    listed_at: Date;
  }>(
    `SELECT a.id AS asset_id, a.filename, a.modality, a.preview_url,
            l.license_preset, l.price_wei::text AS price_wei,
            c.anon_id AS creator_anon_id, c.kyc_status AS creator_kyc_status,
            l.created_at AS listed_at
     FROM listing l
     JOIN asset a ON a.id = l.asset_id
     JOIN creator c ON c.id = a.creator_id
     WHERE ${where.join(" AND ")}
     ORDER BY l.created_at DESC`,
    params,
  );
  return rows.rows.map((row) => ({
    assetId: row.asset_id,
    filename: row.filename,
    modality: row.modality,
    previewUrl: row.preview_url,
    licensePreset: row.license_preset,
    priceWei: weiFromDb(row.price_wei),
    creatorAnonId: row.creator_anon_id,
    creatorKycStatus: row.creator_kyc_status,
    listedAt: row.listed_at,
  }));
}

export interface CatalogDetail extends CatalogItem {
  labels: { key: string; value: string }[];
  stage: string;
  creatorId: string;
}

export async function getCatalogItem(
  assetId: string,
  q: Queryable = db,
): Promise<CatalogDetail | null> {
  const rows = await q.query<{
    asset_id: string;
    filename: string | null;
    modality: string;
    preview_url: string | null;
    license_preset: string;
    price_wei: string;
    creator_anon_id: string;
    creator_kyc_status: string;
    creator_id: string;
    stage: string;
    listed_at: Date;
  }>(
    `SELECT a.id AS asset_id, a.filename, a.modality, a.preview_url,
            l.license_preset, l.price_wei::text AS price_wei,
            c.anon_id AS creator_anon_id, c.kyc_status AS creator_kyc_status, c.id AS creator_id,
            a.stage::text AS stage, l.created_at AS listed_at
     FROM listing l
     JOIN asset a ON a.id = l.asset_id
     JOIN creator c ON c.id = a.creator_id
     WHERE a.id = $1 AND l.status = 'active'
     ORDER BY l.created_at DESC LIMIT 1`,
    [assetId],
  );
  const row = rows.rows[0];
  if (!row) return null;

  const labels = await q.query<{ key: string; value: string }>(
    `SELECT key, value #>> '{}' AS value FROM asset_label
     WHERE asset_id = $1 AND namespace != 'wtr'
     ORDER BY key`,
    [assetId],
  );
  return {
    assetId: row.asset_id,
    filename: row.filename,
    modality: row.modality,
    previewUrl: row.preview_url,
    licensePreset: row.license_preset,
    priceWei: weiFromDb(row.price_wei),
    creatorAnonId: row.creator_anon_id,
    creatorKycStatus: row.creator_kyc_status,
    creatorId: row.creator_id,
    stage: row.stage,
    listedAt: row.listed_at,
    labels: labels.rows,
  };
}

export interface PurchaseReadiness {
  ready: boolean;
  /** Plain-language blockers, safe to render. */
  blockers: string[];
  alreadySettled: boolean;
  /** A mint happened but payout/settlement did not — the buyer may resume. */
  resumable: boolean;
}

async function saleBuyerAnonId(assetId: string, q: Queryable): Promise<string | null> {
  const rows = await q.query<{ buyer_anon_id: string }>(
    "SELECT buyer_anon_id FROM sale WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1",
    [assetId],
  );
  return rows.rows[0]?.buyer_anon_id ?? null;
}

export async function purchaseReadiness(
  buyer: { id: string; anonId: string; walletAddress: string | null },
  assetId: string,
): Promise<PurchaseReadiness | null> {
  const item = await getCatalogItem(assetId);
  if (!item) return null;

  const blockers: string[] = [];
  // Only SETTLED is terminal. The settle handler sets SOLD after the mint but
  // before the payout sub-step, so a SOLD asset is a half-finished purchase
  // that its buyer must be able to resume — otherwise the creator is never
  // credited.
  const alreadySettled = item.stage === "SETTLED";
  let resumable = false;
  if (item.stage === "SOLD") {
    const soldTo = await saleBuyerAnonId(assetId, db);
    if (soldTo === buyer.anonId) {
      resumable = true;
    } else {
      blockers.push("another buyer's purchase of this asset is completing");
    }
  }
  if (item.creatorId === buyer.id) {
    blockers.push("you cannot buy your own listing");
  }
  if (!buyer.walletAddress) {
    blockers.push("add a wallet address in settings to receive the license token");
  }
  if (!process.env.WTR_WALLET_PRIVATE_KEY) {
    blockers.push("the operator wallet is not configured on this server");
  }
  if (TRACE_MODE() === "live" && !process.env.WTR_TRACE_API_KEY) {
    blockers.push("the Trace provider key is not configured on this server");
  }
  return { ready: blockers.length === 0 && !alreadySettled, blockers, alreadySettled, resumable };
}

/**
 * Runs the stage-5 settle handler for one listed asset: live fee read, real
 * license-token mint to the buyer's wallet, payout credit (promoted to Trace
 * as a full-state update), then settlement. Idempotent — a retry resumes
 * from the recorded sub-steps.
 */
export async function purchaseAsset(
  buyer: { id: string; anonId: string; walletAddress: string | null },
  assetId: string,
): Promise<StageResult> {
  const readiness = await purchaseReadiness(buyer, assetId);
  if (!readiness) throw new CatalogError("this listing is no longer available");
  if (readiness.alreadySettled) throw new CatalogError("this asset has already been sold");
  if (!readiness.ready) throw new CatalogError(readiness.blockers[0]);
  const item = await getCatalogItem(assetId);
  if (!item) throw new CatalogError("this listing is no longer available");
  if (!(LICENSE_PRESETS as readonly string[]).includes(item.licensePreset)) {
    throw new CatalogError("this listing carries unknown license terms");
  }

  const clients = await createClients();
  const trace = createTraceClient();
  const ports = createPorts({ clients, trace, traceMock: isTraceMock(), mediaDir: MEDIA_DIR() });
  const store = new PgAssetStore(db);
  const handlers = createStageHandlers({
    store,
    ports,
    owner: clients.account.address,
    now: () => new Date(),
    proposeLabels: async () => [],
    quotePriceWei: async () => item.priceWei,
    buyer: { anonId: buyer.anonId, receiver: buyer.walletAddress as `0x${string}` },
    defaultLicensePreset: item.licensePreset as LicensePreset,
  });
  return handlers.settle(assetId);
}
