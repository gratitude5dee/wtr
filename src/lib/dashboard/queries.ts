/**
 * Read models for the creator dashboard. Every query here reads projections —
 * `asset`, `listing`, `sale`, `payout` — plus the `asset_event` log for
 * timelines. Nothing in this module writes.
 */
import { cookies } from "next/headers";

import { DEMO_CREATOR } from "../../../config/env";
import { readSession, SESSION_COOKIE, sessionsEnabled } from "../auth/session";
import { db, type Queryable } from "../db/pool";
import { weiFromDb } from "../money";

export type Modality = "audio" | "video" | "image" | "threed" | "motion" | "agenttrace";

export interface CreatorRow {
  id: string;
  anonId: string;
  displayName: string | null;
  avatarSeed: string;
  walletAddress: string | null;
  kycStatus: string;
  kycCountry: string | null;
  taxStatus: string;
  payoutPref: string;
  labVerified: boolean;
}

/**
 * The signed-in creator. With `WTR_SESSION_SECRET` set, identity comes from
 * the HMAC-signed wallet session cookie; without it (local development) the
 * dashboard falls back to the earliest creator row.
 */
export async function getCurrentCreator(q: Queryable = db): Promise<CreatorRow | null> {
  return resolveCreator(true, q);
}

/**
 * The creator on whose behalf a mutation may run. Unlike `getCurrentCreator`
 * this never falls back to the `WTR_DEMO_CREATOR` showcase identity, so
 * signed-out visitors can browse the demo data but cannot modify it.
 */
export async function getActingCreator(q: Queryable = db): Promise<CreatorRow | null> {
  return resolveCreator(false, q);
}

async function resolveCreator(
  allowDemo: boolean,
  q: Queryable,
): Promise<CreatorRow | null> {
  // Local-dev fallback: the account with work in it, so seeded lab identities
  // (which own no assets) never stand in for the creator being previewed.
  let where = `ORDER BY (SELECT count(*) FROM asset a WHERE a.creator_id = creator.id) DESC,
               created_at ASC LIMIT 1`;
  const params: string[] = [];
  if (sessionsEnabled()) {
    const jar = await cookies();
    const session = readSession(jar.get(SESSION_COOKIE)?.value ?? "");
    if (session) {
      where = "WHERE id = $1";
      params.push(session.creatorId);
    } else {
      const demo = allowDemo ? DEMO_CREATOR() : null;
      if (!demo) return null;
      where = "WHERE anon_id = $1";
      params.push(demo);
    }
  }
  const result = await q.query<{
    id: string;
    anon_id: string;
    display_name: string | null;
    avatar_seed: string;
    wallet_address: string | null;
    kyc_status: string;
    kyc_country: string | null;
    tax_status: string;
    payout_pref: string;
    lab_verified: boolean;
  }>(
    `SELECT id, anon_id, display_name, avatar_seed, wallet_address,
            kyc_status, kyc_country, tax_status, payout_pref, lab_verified
     FROM creator ${where}`,
    params,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    anonId: row.anon_id,
    displayName: row.display_name,
    avatarSeed: row.avatar_seed,
    walletAddress: row.wallet_address,
    kycStatus: row.kyc_status,
    kycCountry: row.kyc_country,
    taxStatus: row.tax_status,
    payoutPref: row.payout_pref,
    labVerified: row.lab_verified,
  };
}

export interface FunnelRow {
  stage: string;
  count: number;
}

export async function getPipelineFunnel(creatorId: string, q: Queryable = db): Promise<FunnelRow[]> {
  const result = await q.query<{ stage: string; count: string }>(
    `SELECT stage::text AS stage, count(*)::text AS count
     FROM asset WHERE creator_id = $1 GROUP BY stage`,
    [creatorId],
  );
  const byStage = new Map(result.rows.map((row) => [row.stage, Number(row.count)]));
  const ORDER = ["IN_TRAY", "LABELED", "REGISTERED", "LISTED", "SOLD", "SETTLED", "FAILED_REGISTER"];
  return ORDER.map((stage) => ({ stage, count: byStage.get(stage) ?? 0 }));
}

export interface OverviewStats {
  listed: number;
  pipeline: number;
  grossWei: bigint;
  claimableWei: bigint;
}

/** Headline numbers for the overview cards, all from projections. */
export async function getOverviewStats(
  creatorId: string,
  q: Queryable = db,
): Promise<OverviewStats> {
  const [stages, gross, unpaid] = await Promise.all([
    q.query<{ stage: string; count: string }>(
      `SELECT stage::text AS stage, count(*)::text AS count
       FROM asset WHERE creator_id = $1 GROUP BY stage`,
      [creatorId],
    ),
    q.query<{ total: string }>(
      `SELECT coalesce(sum(s.amount_wei), 0)::text AS total
       FROM sale s JOIN asset a ON a.id = s.asset_id WHERE a.creator_id = $1`,
      [creatorId],
    ),
    q.query<{ total: string }>(
      `SELECT coalesce(sum(amount_wei), 0)::text AS total
       FROM payout WHERE creator_id = $1 AND status IN ('pending', 'credited')`,
      [creatorId],
    ),
  ]);
  const byStage = new Map(stages.rows.map((row) => [row.stage, Number(row.count)]));
  const pipelineStages = ["IN_TRAY", "LABELED", "REGISTERED", "FAILED_REGISTER"];
  const grossWei = weiFromDb(gross.rows[0]?.total ?? "0");
  const claimableWei = weiFromDb(unpaid.rows[0]?.total ?? "0");
  return {
    listed: byStage.get("LISTED") ?? 0,
    pipeline: pipelineStages.reduce((sum, stage) => sum + (byStage.get(stage) ?? 0), 0),
    grossWei,
    claimableWei,
  };
}

export interface NavCounts {
  assets: number;
  requests: number;
  catalog: number;
}

/** Live counts shown next to the nav rail's links. */
export async function getNavCounts(
  creatorId: string | null,
  q: Queryable = db,
): Promise<NavCounts> {
  const [assets, requests, catalog] = await Promise.all([
    creatorId
      ? q.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM asset WHERE creator_id = $1`,
          [creatorId],
        )
      : null,
    q.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM data_request WHERE status = 'open'`,
    ),
    q.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM listing l JOIN asset a ON a.id = l.asset_id
       WHERE l.status = 'active' AND a.stage IN ('LISTED', 'SOLD', 'SETTLED')`,
    ),
  ]);
  return {
    assets: assets ? Number(assets.rows[0]?.count ?? 0) : 0,
    requests: Number(requests.rows[0]?.count ?? 0),
    catalog: Number(catalog.rows[0]?.count ?? 0),
  };
}

export interface EarningsPoint {
  month: string;
  /** Wei, kept as bigint until the render boundary. */
  catalogWei: bigint;
  requestsWei: bigint;
}

export async function getEarningsByMonth(
  creatorId: string,
  q: Queryable = db,
): Promise<EarningsPoint[]> {
  const result = await q.query<{
    month: string;
    channel: string;
    total: string;
  }>(
    `SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month,
            CASE WHEN s.data_request_id IS NULL THEN 'catalog' ELSE 'requests' END AS channel,
            sum(s.amount_wei)::text AS total
     FROM sale s JOIN asset a ON a.id = s.asset_id
     WHERE a.creator_id = $1
     GROUP BY 1, 2 ORDER BY 1`,
    [creatorId],
  );
  const byMonth = new Map<string, EarningsPoint>();
  for (const row of result.rows) {
    const point = byMonth.get(row.month) ?? {
      month: row.month,
      catalogWei: 0n,
      requestsWei: 0n,
    };
    if (row.channel === "catalog") point.catalogWei += weiFromDb(row.total);
    else point.requestsWei += weiFromDb(row.total);
    byMonth.set(row.month, point);
  }
  return [...byMonth.values()];
}

export interface AssetSummary {
  id: string;
  stage: string;
  modality: string;
  filename: string | null;
  byteSize: string | null;
  contentSha256: string;
  duplicateClaimFlag: boolean;
  ipId: string | null;
  traceDataId: string | null;
  createdAt: Date;
  licensePreset: string | null;
  priceWei: bigint | null;
  listingStatus: string | null;
  salesCount: number;
  grossWei: bigint;
}

export async function listAssets(creatorId: string, q: Queryable = db): Promise<AssetSummary[]> {
  const result = await q.query<{
    id: string;
    stage: string;
    modality: string;
    filename: string | null;
    byte_size: string | null;
    content_sha256: string;
    duplicate_claim_flag: boolean;
    ip_id: string | null;
    trace_data_id: string | null;
    created_at: Date;
    license_preset: string | null;
    price_wei: string | null;
    listing_status: string | null;
    sales_count: string;
    gross_wei: string | null;
  }>(
    `SELECT a.id, a.stage::text AS stage, a.modality, a.filename,
            a.byte_size::text AS byte_size, a.content_sha256,
            a.duplicate_claim_flag, a.ip_id, a.trace_data_id, a.created_at,
            l.license_preset, l.price_wei::text AS price_wei, l.status AS listing_status,
            count(s.id)::text AS sales_count,
            coalesce(sum(s.amount_wei), 0)::text AS gross_wei
     FROM asset a
     LEFT JOIN LATERAL (
       SELECT license_preset, price_wei, status
       FROM listing WHERE asset_id = a.id ORDER BY created_at DESC LIMIT 1
     ) l ON true
     LEFT JOIN sale s ON s.asset_id = a.id
     WHERE a.creator_id = $1
     GROUP BY a.id, l.license_preset, l.price_wei, l.status
     ORDER BY a.created_at DESC`,
    [creatorId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    modality: row.modality,
    filename: row.filename,
    byteSize: row.byte_size,
    contentSha256: row.content_sha256,
    duplicateClaimFlag: row.duplicate_claim_flag,
    ipId: row.ip_id,
    traceDataId: row.trace_data_id,
    createdAt: row.created_at,
    licensePreset: row.license_preset,
    priceWei: row.price_wei === null ? null : weiFromDb(row.price_wei),
    listingStatus: row.listing_status,
    salesCount: Number(row.sales_count),
    grossWei: weiFromDb(row.gross_wei ?? "0"),
  }));
}

export interface AssetLabelRow {
  id: string;
  namespace: string;
  key: string;
  value: unknown;
  source: string;
  confidence: number | null;
  modelId: string | null;
  confirmedByCreator: boolean;
}

export interface AssetEventRow {
  seq: number;
  eventType: string;
  promotedToTrace: boolean;
  createdAt: Date;
}

export interface AssetDetail {
  id: string;
  stage: string;
  modality: string;
  filename: string | null;
  contentSha256: string;
  duplicateClaimFlag: boolean;
  ipId: string | null;
  traceDataId: string | null;
  createdAt: Date;
  byteSize: string | null;
  mediaType: string;
  previewUrl: string | null;
  ipfsCid: string | null;
  cdrVaultUuid: number | null;
  licenseTermsId: string | null;
  traceMetadataRoot: string | null;
  labels: AssetLabelRow[];
  events: AssetEventRow[];
  listing: { licensePreset: string; priceWei: bigint; status: string } | null;
}

export async function getAssetDetail(
  creatorId: string,
  assetId: string,
  q: Queryable = db,
): Promise<AssetDetail | null> {
  const assetResult = await q.query<{
    id: string;
    stage: string;
    modality: string;
    filename: string | null;
    byte_size: string | null;
    media_type: string;
    content_sha256: string;
    duplicate_claim_flag: boolean;
    preview_url: string | null;
    ipfs_cid: string | null;
    cdr_vault_uuid: number | null;
    ip_id: string | null;
    license_terms_id: string | null;
    trace_data_id: string | null;
    trace_metadata_root: string | null;
    created_at: Date;
  }>(
    `SELECT id, stage::text AS stage, modality, filename, byte_size::text AS byte_size,
            media_type, content_sha256, duplicate_claim_flag, preview_url, ipfs_cid,
            cdr_vault_uuid, ip_id, license_terms_id::text AS license_terms_id,
            trace_data_id, trace_metadata_root, created_at
     FROM asset WHERE id = $1 AND creator_id = $2`,
    [assetId, creatorId],
  );
  const asset = assetResult.rows[0];
  if (!asset) return null;

  const [labels, events, listing] = await Promise.all([
    q.query<{
      id: string;
      namespace: string;
      key: string;
      value: unknown;
      source: string;
      confidence: number | null;
      model_id: string | null;
      confirmed_by_creator: boolean;
    }>(
      `SELECT id, namespace, key, value, source, confidence, model_id, confirmed_by_creator
       FROM asset_label WHERE asset_id = $1 ORDER BY namespace, key`,
      [assetId],
    ),
    q.query<{ seq: number; event_type: string; promoted_to_trace: boolean; created_at: Date }>(
      `SELECT seq, event_type, promoted_to_trace, created_at
       FROM asset_event WHERE asset_id = $1 ORDER BY seq`,
      [assetId],
    ),
    q.query<{ license_preset: string; price_wei: string; status: string }>(
      `SELECT license_preset, price_wei::text AS price_wei, status
       FROM listing WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [assetId],
    ),
  ]);

  return {
    id: asset.id,
    stage: asset.stage,
    modality: asset.modality,
    filename: asset.filename,
    byteSize: asset.byte_size,
    mediaType: asset.media_type,
    contentSha256: asset.content_sha256,
    duplicateClaimFlag: asset.duplicate_claim_flag,
    previewUrl: asset.preview_url,
    ipfsCid: asset.ipfs_cid,
    cdrVaultUuid: asset.cdr_vault_uuid,
    ipId: asset.ip_id,
    licenseTermsId: asset.license_terms_id,
    traceDataId: asset.trace_data_id,
    traceMetadataRoot: asset.trace_metadata_root,
    createdAt: asset.created_at,
    labels: labels.rows.map((row) => ({
      id: row.id,
      namespace: row.namespace,
      key: row.key,
      value: row.value,
      source: row.source,
      confidence: row.confidence,
      modelId: row.model_id,
      confirmedByCreator: row.confirmed_by_creator,
    })),
    events: events.rows.map((row) => ({
      seq: row.seq,
      eventType: row.event_type,
      promotedToTrace: row.promoted_to_trace,
      createdAt: row.created_at,
    })),
    listing: listing.rows[0]
      ? {
          licensePreset: listing.rows[0].license_preset,
          priceWei: weiFromDb(listing.rows[0].price_wei),
          status: listing.rows[0].status,
        }
      : null,
  };
}

export interface SaleRow {
  id: string;
  assetId: string;
  filename: string | null;
  channel: "catalog" | "requests";
  amountWei: bigint;
  txHash: string | null;
  createdAt: Date;
}

export async function listSales(creatorId: string, q: Queryable = db): Promise<SaleRow[]> {
  const result = await q.query<{
    id: string;
    asset_id: string;
    filename: string | null;
    data_request_id: string | null;
    amount_wei: string;
    tx_hash: string | null;
    created_at: Date;
  }>(
    `SELECT s.id, s.asset_id, a.filename, s.data_request_id,
            s.amount_wei::text AS amount_wei, s.tx_hash, s.created_at
     FROM sale s JOIN asset a ON a.id = s.asset_id
     WHERE a.creator_id = $1 ORDER BY s.created_at DESC`,
    [creatorId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    filename: row.filename,
    channel: row.data_request_id === null ? "catalog" : "requests",
    amountWei: weiFromDb(row.amount_wei),
    txHash: row.tx_hash,
    createdAt: row.created_at,
  }));
}

export interface PayoutRow {
  id: string;
  rail: string;
  amountWei: bigint;
  status: string;
  txHash: string | null;
  externalRef: string | null;
  createdAt: Date;
}

export async function listPayouts(creatorId: string, q: Queryable = db): Promise<PayoutRow[]> {
  const result = await q.query<{
    id: string;
    rail: string;
    amount_wei: string;
    status: string;
    tx_hash: string | null;
    external_ref: string | null;
    created_at: Date;
  }>(
    `SELECT id, rail, amount_wei::text AS amount_wei, status, tx_hash, external_ref, created_at
     FROM payout WHERE creator_id = $1 ORDER BY created_at DESC`,
    [creatorId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    rail: row.rail,
    amountWei: weiFromDb(row.amount_wei),
    status: row.status,
    txHash: row.tx_hash,
    externalRef: row.external_ref,
    createdAt: row.created_at,
  }));
}

export interface ConsentRow {
  documentVersion: string;
  documentSha256: string;
  documentUri: string | null;
  privacyVersion: string | null;
  scopes: unknown;
  acceptedAt: Date;
  revokedAt: Date | null;
}

export async function listConsentHistory(
  creatorId: string,
  q: Queryable = db,
): Promise<ConsentRow[]> {
  const result = await q.query<{
    document_version: string;
    document_sha256: string;
    document_uri: string | null;
    privacy_version: string | null;
    scopes: unknown;
    accepted_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT document_version, document_sha256, document_uri, privacy_version, scopes, accepted_at, revoked_at
     FROM consent_acceptance WHERE creator_id = $1 ORDER BY accepted_at DESC`,
    [creatorId],
  );
  return result.rows.map((row) => ({
    documentVersion: row.document_version,
    documentSha256: row.document_sha256,
    documentUri: row.document_uri,
    privacyVersion: row.privacy_version,
    scopes: row.scopes,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }));
}

export interface DataRequestRow {
  id: string;
  title: string;
  requester: string;
  licensePreset: string;
  budgetWei: bigint;
  unitPriceWei: bigint | null;
  kycRequired: boolean;
  deadline: Date | null;
  fundingMode: string;
  depositWei: bigint | null;
  amountPaidWei: bigint;
  dataShape: Record<string, string> | null;
  specialInstructions: string | null;
  modality: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  mySubmissions: number;
  totalSubmissions: number;
}

export async function listDataRequests(
  creatorId: string | null,
  q: Queryable = db,
): Promise<DataRequestRow[]> {
  const result = await q.query<{
    id: string;
    title: string;
    requester_anon_id: string;
    license_preset: string;
    budget_wei: string;
    unit_price_wei: string | null;
    kyc_required: boolean;
    deadline: Date | null;
    funding_mode: string;
    deposit_wei: string | null;
    amount_paid_wei: string;
    data_shape: Record<string, string> | null;
    special_instructions: string | null;
    modality: string | null;
    notes: string | null;
    status: string;
    created_at: Date;
    my_submissions: string;
    total_submissions: string;
  }>(
    `SELECT r.id, r.title, r.requester_anon_id, r.license_preset, r.budget_wei::text AS budget_wei,
            r.unit_price_wei::text AS unit_price_wei, r.kyc_required, r.deadline,
            r.funding_mode, r.deposit_wei::text AS deposit_wei,
            r.amount_paid_wei::text AS amount_paid_wei, r.data_shape,
            r.special_instructions,
            r.spec->>'modality' AS modality, r.spec->>'notes' AS notes,
            r.status, r.created_at,
            count(s.id) FILTER (WHERE a.creator_id = $1)::text AS my_submissions,
            count(s.id)::text AS total_submissions
     FROM data_request r
     LEFT JOIN submission s ON s.data_request_id = r.id
     LEFT JOIN asset a ON a.id = s.asset_id
     GROUP BY r.id ORDER BY r.created_at DESC`,
    [creatorId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    requester: row.requester_anon_id,
    licensePreset: row.license_preset,
    budgetWei: weiFromDb(row.budget_wei),
    unitPriceWei: row.unit_price_wei === null ? null : weiFromDb(row.unit_price_wei),
    kycRequired: row.kyc_required,
    deadline: row.deadline,
    fundingMode: row.funding_mode,
    depositWei: row.deposit_wei === null ? null : weiFromDb(row.deposit_wei),
    amountPaidWei: weiFromDb(row.amount_paid_wei),
    dataShape: row.data_shape,
    specialInstructions: row.special_instructions,
    modality: row.modality,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    mySubmissions: Number(row.my_submissions),
    totalSubmissions: Number(row.total_submissions),
  }));
}

export interface PayoutSummaryBucket {
  key: string;
  totalWei: bigint;
  count: number;
}

export interface PayoutSummary {
  paidWei: bigint;
  pendingWei: bigint;
  byStatus: PayoutSummaryBucket[];
  byRail: PayoutSummaryBucket[];
  /** The oldest payout still owed — the one settling next. */
  nextPayout: { amountWei: bigint; rail: string; status: string; createdAt: Date } | null;
}

/** Per-status and per-rail totals behind the payouts page's stat cards. */
export async function getPayoutSummary(
  creatorId: string,
  q: Queryable = db,
): Promise<PayoutSummary> {
  const [byStatus, byRail, next] = await Promise.all([
    q.query<{ key: string; total: string; count: string }>(
      `SELECT status AS key, sum(amount_wei)::text AS total, count(*)::text AS count
       FROM payout WHERE creator_id = $1 GROUP BY status ORDER BY status`,
      [creatorId],
    ),
    q.query<{ key: string; total: string; count: string }>(
      `SELECT rail AS key, sum(amount_wei)::text AS total, count(*)::text AS count
       FROM payout WHERE creator_id = $1 GROUP BY rail ORDER BY rail`,
      [creatorId],
    ),
    q.query<{ amount_wei: string; rail: string; status: string; created_at: Date }>(
      `SELECT amount_wei::text AS amount_wei, rail, status, created_at
       FROM payout WHERE creator_id = $1 AND status IN ('pending', 'credited')
       ORDER BY created_at ASC LIMIT 1`,
      [creatorId],
    ),
  ]);
  const buckets = (rows: { key: string; total: string; count: string }[]) =>
    rows.map((row) => ({
      key: row.key,
      totalWei: weiFromDb(row.total),
      count: Number(row.count),
    }));
  const statusBuckets = buckets(byStatus.rows);
  const totalFor = (statuses: string[]) =>
    statusBuckets
      .filter((bucket) => statuses.includes(bucket.key))
      .reduce((sum, bucket) => sum + bucket.totalWei, 0n);
  const nextRow = next.rows[0];
  return {
    paidWei: totalFor(["paid"]),
    pendingWei: totalFor(["pending", "credited"]),
    byStatus: statusBuckets,
    byRail: buckets(byRail.rows),
    nextPayout: nextRow
      ? {
          amountWei: weiFromDb(nextRow.amount_wei),
          rail: nextRow.rail,
          status: nextRow.status,
          createdAt: nextRow.created_at,
        }
      : null,
  };
}

export interface RecentActivityRow {
  assetId: string;
  filename: string | null;
  eventType: string;
  createdAt: Date;
}

export async function listRecentActivity(
  creatorId: string,
  limit = 12,
  q: Queryable = db,
): Promise<RecentActivityRow[]> {
  const result = await q.query<{
    asset_id: string;
    filename: string | null;
    event_type: string;
    created_at: Date;
  }>(
    `SELECT e.asset_id, a.filename, e.event_type, e.created_at
     FROM asset_event e JOIN asset a ON a.id = e.asset_id
     WHERE a.creator_id = $1 ORDER BY e.created_at DESC, e.seq DESC LIMIT $2`,
    [creatorId, limit],
  );
  return result.rows.map((row) => ({
    assetId: row.asset_id,
    filename: row.filename,
    eventType: row.event_type,
    createdAt: row.created_at,
  }));
}
