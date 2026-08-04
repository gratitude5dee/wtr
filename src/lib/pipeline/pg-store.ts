import { CHAIN_ID } from "../../../config/chain";
import type { Queryable } from "../db/pool";

import type {
  AppendEventInput,
  AssetStore,
  ConsentRow,
  CreatorRow,
  LabelInput,
  LicensePresetRow,
  ListingRow,
  PayoutRow,
  SaleRow,
} from "./store";
import type { AssetEvent, AssetRow, AssetStage, EventType } from "./types";

interface AssetDbRow {
  id: string;
  creator_id: string;
  stage: AssetStage;
  media_type: string;
  filename: string | null;
  byte_size: string | null;
  content_sha256: string;
  duplicate_claim_flag: boolean;
  ipfs_cid: string | null;
  media_vault_uuid: number | null;
  trace_data_id: string | null;
  trace_metadata_root: string | null;
  trace_update_count: number;
  ip_id: string | null;
  spg_nft_contract: string | null;
  nft_token_id: string | null;
  license_terms_id: string | null;
  cdr_vault_uuid: number | null;
}

interface EventDbRow {
  id: string;
  asset_id: string;
  seq: number;
  event_type: EventType;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  promoted_to_trace: boolean;
  trace_seq: number | null;
  created_at: Date;
}

interface SaleDbRow {
  id: string;
  asset_id: string;
  listing_id: string | null;
  buyer_anon_id: string;
  license_terms_id: string;
  license_token_ids: string[];
  amount_wei: string;
  currency_address: string;
  tx_hash: string | null;
}

interface PayoutDbRow {
  id: string;
  sale_id: string;
  creator_id: string;
  amount_wei: string;
  currency_address: string;
  status: PayoutRow["status"];
  payment_credited_at: Date | null;
}

function toSaleRow(row: SaleDbRow): SaleRow {
  return {
    id: row.id,
    assetId: row.asset_id,
    listingId: row.listing_id,
    buyerAnonId: row.buyer_anon_id,
    licenseTermsId: BigInt(row.license_terms_id),
    licenseTokenIds: (row.license_token_ids ?? []).map((value) => BigInt(value)),
    amountWei: BigInt(row.amount_wei),
    currencyAddress: row.currency_address as `0x${string}`,
    txHash: row.tx_hash as `0x${string}` | null,
  };
}

function toPayoutRow(row: PayoutDbRow): PayoutRow {
  return {
    id: row.id,
    saleId: row.sale_id,
    creatorId: row.creator_id,
    amountWei: BigInt(row.amount_wei),
    currencyAddress: row.currency_address as `0x${string}`,
    status: row.status,
    paymentCreditedAt: row.payment_credited_at,
  };
}

function toAssetRow(row: AssetDbRow): AssetRow {
  return {
    id: row.id,
    creatorId: row.creator_id,
    stage: row.stage,
    mediaType: row.media_type,
    filename: row.filename,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    contentSha256: row.content_sha256,
    duplicateClaimFlag: row.duplicate_claim_flag,
    ipfsCid: row.ipfs_cid,
    mediaVaultUuid: row.media_vault_uuid,
    traceDataId: row.trace_data_id,
    traceMetadataRoot: row.trace_metadata_root,
    traceUpdateCount: row.trace_update_count,
    ipId: row.ip_id as `0x${string}` | null,
    spgNftContract: row.spg_nft_contract as `0x${string}` | null,
    nftTokenId: row.nft_token_id === null ? null : BigInt(row.nft_token_id),
    licenseTermsId: row.license_terms_id === null ? null : BigInt(row.license_terms_id),
    cdrVaultUuid: row.cdr_vault_uuid,
  };
}

function toAssetEvent(row: EventDbRow): AssetEvent {
  return {
    id: Number(row.id),
    assetId: row.asset_id,
    seq: row.seq,
    eventType: row.event_type,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    promotedToTrace: row.promoted_to_trace,
    traceSeq: row.trace_seq,
    createdAt: row.created_at,
  };
}

const PROJECTION_COLUMNS: Record<keyof Omit<AssetRow, "id" | "creatorId">, string> = {
  stage: "stage",
  mediaType: "media_type",
  filename: "filename",
  byteSize: "byte_size",
  contentSha256: "content_sha256",
  duplicateClaimFlag: "duplicate_claim_flag",
  ipfsCid: "ipfs_cid",
  mediaVaultUuid: "media_vault_uuid",
  traceDataId: "trace_data_id",
  traceMetadataRoot: "trace_metadata_root",
  traceUpdateCount: "trace_update_count",
  ipId: "ip_id",
  spgNftContract: "spg_nft_contract",
  nftTokenId: "nft_token_id",
  licenseTermsId: "license_terms_id",
  cdrVaultUuid: "cdr_vault_uuid",
};

export class PgAssetStore implements AssetStore {
  constructor(private readonly sql: Queryable) {}

  async getAsset(assetId: string): Promise<AssetRow | null> {
    const { rows } = await this.sql.query<AssetDbRow>("SELECT * FROM asset WHERE id = $1", [assetId]);
    return rows[0] ? toAssetRow(rows[0]) : null;
  }

  async getCreator(creatorId: string): Promise<CreatorRow | null> {
    const { rows } = await this.sql.query<{
      id: string;
      anon_id: string;
      kyc_status: CreatorRow["kycStatus"];
    }>("SELECT id, anon_id, kyc_status FROM creator WHERE id = $1", [creatorId]);
    const row = rows[0];
    return row ? { id: row.id, anonId: row.anon_id, kycStatus: row.kyc_status } : null;
  }

  async getLatestConsent(creatorId: string): Promise<ConsentRow | null> {
    const { rows } = await this.sql.query<{
      document_version: string;
      document_sha256: string;
      scopes: Record<string, boolean>;
      accepted_at: Date;
    }>(
      `SELECT document_version, document_sha256, scopes, accepted_at
         FROM consent_acceptance
        WHERE creator_id = $1 AND revoked_at IS NULL
        ORDER BY accepted_at DESC
        LIMIT 1`,
      [creatorId],
    );
    const row = rows[0];
    return row
      ? {
          documentVersion: row.document_version,
          documentSha256: row.document_sha256,
          scopes: row.scopes,
          acceptedAt: row.accepted_at,
        }
      : null;
  }

  async putLabels(assetId: string, labels: readonly LabelInput[]): Promise<void> {
    for (const label of labels) {
      await this.sql.query(
        `INSERT INTO asset_label (asset_id, namespace, key, value, source, confidence)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (asset_id, namespace, key)
         DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, confidence = EXCLUDED.confidence`,
        [
          assetId,
          label.namespace,
          label.key,
          JSON.stringify(label.value),
          label.source,
          label.confidence ?? null,
        ],
      );
    }
  }

  async getLabels(assetId: string): Promise<Record<string, unknown>> {
    const { rows } = await this.sql.query<{ namespace: string; key: string; value: unknown }>(
      "SELECT namespace, key, value FROM asset_label WHERE asset_id = $1",
      [assetId],
    );
    return Object.fromEntries(rows.map((row) => [`${row.namespace}:${row.key}`, row.value]));
  }

  async createListing(input: {
    assetId: string;
    licensePreset: string;
    licenseTermsId: bigint;
    priceWei: bigint;
    currencyAddress: `0x${string}`;
  }): Promise<ListingRow> {
    const { rows } = await this.sql.query<{
      id: string;
      asset_id: string;
      license_preset: string;
      license_terms_id: string;
      price_wei: string;
      currency_address: string;
      status: ListingRow["status"];
    }>(
      `INSERT INTO listing (asset_id, license_preset, license_terms_id, price_wei, currency_address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (asset_id, license_preset) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [
        input.assetId,
        input.licensePreset,
        input.licenseTermsId.toString(),
        input.priceWei.toString(),
        input.currencyAddress,
      ],
    );
    const row = rows[0];
    return {
      id: row.id,
      assetId: row.asset_id,
      licensePreset: row.license_preset,
      licenseTermsId: BigInt(row.license_terms_id),
      priceWei: BigInt(row.price_wei),
      currencyAddress: row.currency_address as `0x${string}`,
      status: row.status,
    };
  }

  async getListing(assetId: string, licensePreset: string): Promise<ListingRow | null> {
    const { rows } = await this.sql.query<{
      id: string;
      asset_id: string;
      license_preset: string;
      license_terms_id: string;
      price_wei: string;
      currency_address: string;
      status: ListingRow["status"];
    }>("SELECT * FROM listing WHERE asset_id = $1 AND license_preset = $2", [
      assetId,
      licensePreset,
    ]);
    const row = rows[0];
    return row
      ? {
          id: row.id,
          assetId: row.asset_id,
          licensePreset: row.license_preset,
          licenseTermsId: BigInt(row.license_terms_id),
          priceWei: BigInt(row.price_wei),
          currencyAddress: row.currency_address as `0x${string}`,
          status: row.status,
        }
      : null;
  }

  async recordSale(input: {
    assetId: string;
    listingId: string | null;
    buyerAnonId: string;
    licenseTermsId: bigint;
    licenseTokenIds: readonly bigint[];
    amountWei: bigint;
    currencyAddress: `0x${string}`;
    txHash: `0x${string}` | null;
  }): Promise<SaleRow> {
    const { rows } = await this.sql.query<{
      id: string;
      asset_id: string;
      listing_id: string | null;
      buyer_anon_id: string;
      license_terms_id: string;
      license_token_ids: string[];
      amount_wei: string;
      currency_address: string;
      tx_hash: string | null;
    }>(
      `INSERT INTO sale
         (asset_id, listing_id, buyer_anon_id, license_terms_id, license_token_ids, amount_wei, currency_address, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.assetId,
        input.listingId,
        input.buyerAnonId,
        input.licenseTermsId.toString(),
        input.licenseTokenIds.map(String),
        input.amountWei.toString(),
        input.currencyAddress,
        input.txHash,
      ],
    );
    return toSaleRow(rows[0]);
  }

  async getSale(assetId: string): Promise<SaleRow | null> {
    const { rows } = await this.sql.query<SaleDbRow>(
      "SELECT * FROM sale WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1",
      [assetId],
    );
    return rows[0] ? toSaleRow(rows[0]) : null;
  }

  async creditPayout(input: {
    saleId: string;
    creatorId: string;
    amountWei: bigint;
    currencyAddress: `0x${string}`;
    paymentCreditedAt: Date;
  }): Promise<PayoutRow> {
    const { rows } = await this.sql.query<PayoutDbRow>(
      `INSERT INTO payout (sale_id, creator_id, amount_wei, currency_address, status, payment_credited_at)
       VALUES ($1, $2, $3, $4, 'credited', $5)
       RETURNING *`,
      [
        input.saleId,
        input.creatorId,
        input.amountWei.toString(),
        input.currencyAddress,
        input.paymentCreditedAt,
      ],
    );
    return toPayoutRow(rows[0]);
  }

  async getPayout(saleId: string): Promise<PayoutRow | null> {
    const { rows } = await this.sql.query<PayoutDbRow>(
      "SELECT * FROM payout WHERE sale_id = $1 ORDER BY created_at DESC LIMIT 1",
      [saleId],
    );
    return rows[0] ? toPayoutRow(rows[0]) : null;
  }

  async listEvents(assetId: string): Promise<AssetEvent[]> {
    const { rows } = await this.sql.query<EventDbRow>(
      "SELECT * FROM asset_event WHERE asset_id = $1 ORDER BY seq ASC",
      [assetId],
    );
    return rows.map(toAssetEvent);
  }

  async appendEvent(input: AppendEventInput): Promise<AssetEvent> {
    const { rows } = await this.sql.query<EventDbRow>(
      `INSERT INTO asset_event
         (asset_id, seq, event_type, payload, idempotency_key, promoted_to_trace, trace_seq)
       VALUES (
         $1,
         (SELECT COALESCE(MAX(seq), 0) + 1 FROM asset_event WHERE asset_id = $1),
         $2, $3::jsonb, $4, $5, $6
       )
       ON CONFLICT (asset_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.assetId,
        input.eventType,
        JSON.stringify(input.payload ?? {}),
        input.idempotencyKey ?? null,
        input.promotedToTrace ?? false,
        input.traceSeq ?? null,
      ],
    );
    if (rows[0]) return toAssetEvent(rows[0]);

    // Conflict: the semantically identical event is already in the log.
    const existing = await this.sql.query<EventDbRow>(
      "SELECT * FROM asset_event WHERE asset_id = $1 AND idempotency_key = $2",
      [input.assetId, input.idempotencyKey ?? null],
    );
    return toAssetEvent(existing.rows[0]);
  }

  async updateAssetProjection(
    assetId: string,
    patch: Partial<Omit<AssetRow, "id" | "creatorId">>,
  ): Promise<void> {
    const assignments: string[] = [];
    const params: unknown[] = [assetId];
    for (const [key, value] of Object.entries(patch)) {
      const column = PROJECTION_COLUMNS[key as keyof typeof PROJECTION_COLUMNS];
      if (!column) continue;
      params.push(typeof value === "bigint" ? value.toString() : value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (assignments.length === 0) return;
    await this.sql.query(
      `UPDATE asset SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1`,
      params,
    );
  }

  async setStage(assetId: string, stage: AssetStage): Promise<void> {
    await this.sql.query("UPDATE asset SET stage = $2, updated_at = now() WHERE id = $1", [
      assetId,
      stage,
    ]);
  }

  async getLicensePreset(preset: string): Promise<LicensePresetRow | null> {
    const { rows } = await this.sql.query<{
      preset: string;
      license_terms_id: string;
      terms_uri: string;
      terms_sha256: string;
      ai_learning_models: boolean;
    }>(
      "SELECT preset, license_terms_id, terms_uri, terms_sha256, ai_learning_models FROM license_preset WHERE chain_id = $1 AND preset = $2",
      [CHAIN_ID, preset],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      preset: row.preset,
      licenseTermsId: BigInt(row.license_terms_id),
      termsUri: row.terms_uri,
      termsSha256: row.terms_sha256,
      aiLearningModels: row.ai_learning_models,
    };
  }

  async getSpgNftContract(): Promise<`0x${string}` | null> {
    const { rows } = await this.sql.query<{ contract_address: string }>(
      "SELECT contract_address FROM spg_collection WHERE chain_id = $1 ORDER BY created_at DESC LIMIT 1",
      [CHAIN_ID],
    );
    return (rows[0]?.contract_address as `0x${string}` | undefined) ?? null;
  }
}
