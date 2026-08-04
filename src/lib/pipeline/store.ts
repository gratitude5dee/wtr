/**
 * The pipeline's only door to persistence.
 *
 * Stage handlers depend on this interface, never on `pg`, so the failure-path
 * tests can drive them against an in-memory implementation
 * (`src/lib/pipeline/testing/memory-store.ts`).
 */
import type { AssetEvent, AssetRow, AssetStage, EventType } from "./types";

export interface AppendEventInput {
  assetId: string;
  eventType: EventType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  promotedToTrace?: boolean;
  traceSeq?: number;
}

export interface LicensePresetRow {
  preset: string;
  licenseTermsId: bigint;
  termsUri: string;
  termsSha256: string;
  aiLearningModels: boolean;
}

export interface CreatorRow {
  id: string;
  anonId: string;
  kycStatus: "unverified" | "pending" | "verified" | "failed";
}

export interface ConsentRow {
  documentVersion: string;
  documentSha256: string;
  scopes: Record<string, boolean>;
  acceptedAt: Date;
}

export interface LabelInput {
  namespace: string;
  key: string;
  value: unknown;
  source: "human" | "model" | "import" | "creator";
  confidence?: number;
}

export interface ListingRow {
  id: string;
  assetId: string;
  licensePreset: string;
  licenseTermsId: bigint;
  priceWei: bigint;
  currencyAddress: `0x${string}`;
  status: "active" | "paused" | "withdrawn" | "sold";
}

export interface SaleRow {
  id: string;
  assetId: string;
  listingId: string | null;
  buyerAnonId: string;
  licenseTermsId: bigint;
  licenseTokenIds: bigint[];
  amountWei: bigint;
  currencyAddress: `0x${string}`;
  txHash: `0x${string}` | null;
}

export interface PayoutRow {
  id: string;
  saleId: string;
  creatorId: string;
  amountWei: bigint;
  currencyAddress: `0x${string}`;
  status: "pending" | "credited" | "paid" | "failed";
  paymentCreditedAt: Date | null;
}

export interface AssetStore {
  getAsset(assetId: string): Promise<AssetRow | null>;
  getCreator(creatorId: string): Promise<CreatorRow | null>;
  /** Latest non-revoked acceptance. Acceptances are appended, never overwritten. */
  getLatestConsent(creatorId: string): Promise<ConsentRow | null>;
  putLabels(assetId: string, labels: readonly LabelInput[]): Promise<void>;
  getLabels(assetId: string): Promise<Record<string, unknown>>;
  createListing(input: {
    assetId: string;
    licensePreset: string;
    licenseTermsId: bigint;
    priceWei: bigint;
    currencyAddress: `0x${string}`;
  }): Promise<ListingRow>;
  getListing(assetId: string, licensePreset: string): Promise<ListingRow | null>;
  recordSale(input: {
    assetId: string;
    listingId: string | null;
    buyerAnonId: string;
    licenseTermsId: bigint;
    licenseTokenIds: readonly bigint[];
    amountWei: bigint;
    currencyAddress: `0x${string}`;
    txHash: `0x${string}` | null;
  }): Promise<SaleRow>;
  getSale(assetId: string): Promise<SaleRow | null>;
  creditPayout(input: {
    saleId: string;
    creatorId: string;
    amountWei: bigint;
    currencyAddress: `0x${string}`;
    paymentCreditedAt: Date;
  }): Promise<PayoutRow>;
  getPayout(saleId: string): Promise<PayoutRow | null>;
  /** Full event log for an asset, ordered by `seq` ascending. */
  listEvents(assetId: string): Promise<AssetEvent[]>;
  /** Appends an event. Re-appending the same `(assetId, idempotencyKey)` is a no-op. */
  appendEvent(input: AppendEventInput): Promise<AssetEvent>;
  /** Updates the projection. Never a source of truth — always derived from events. */
  updateAssetProjection(
    assetId: string,
    patch: Partial<Omit<AssetRow, "id" | "creatorId">>,
  ): Promise<void>;
  setStage(assetId: string, stage: AssetStage): Promise<void>;
  getLicensePreset(preset: string): Promise<LicensePresetRow | null>;
  getSpgNftContract(): Promise<`0x${string}` | null>;
}

/** Does the log already contain an event of this type? */
export function hasEvent(events: readonly AssetEvent[], eventType: EventType): boolean {
  return events.some((event) => event.eventType === eventType);
}

/** Most recent event of a type, or `undefined`. */
export function lastEvent(
  events: readonly AssetEvent[],
  eventType: EventType,
): AssetEvent | undefined {
  return [...events].reverse().find((event) => event.eventType === eventType);
}

/** Highest `trace_seq` recorded so far — the position the next promotion continues from. */
export function lastTraceSeq(events: readonly AssetEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.traceSeq ?? 0), 0);
}
