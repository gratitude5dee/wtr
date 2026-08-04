/**
 * In-memory {@link AssetStore} for the failure-path tests.
 *
 * It reproduces the two behaviours the handlers rely on: the event log is
 * append-only, and `(assetId, idempotencyKey)` is unique so a replayed append is
 * a no-op instead of a duplicate.
 */
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
} from "../store";
import type { AssetEvent, AssetRow } from "../types";

export interface MemorySeed {
  asset: AssetRow;
  creator: CreatorRow;
  consent?: ConsentRow;
  presets?: LicensePresetRow[];
  spgNftContract?: `0x${string}`;
}

export class MemoryAssetStore implements AssetStore {
  readonly events: AssetEvent[] = [];
  readonly labels = new Map<string, unknown>();
  readonly listings: ListingRow[] = [];
  readonly sales: SaleRow[] = [];
  readonly payouts: PayoutRow[] = [];
  asset: AssetRow;
  private readonly creator: CreatorRow;
  private readonly consent: ConsentRow | null;
  private readonly presets: Map<string, LicensePresetRow>;
  private readonly spgNftContract: `0x${string}` | null;
  private counter = 0;

  constructor(seed: MemorySeed) {
    this.asset = { ...seed.asset };
    this.creator = seed.creator;
    this.consent = seed.consent ?? null;
    this.presets = new Map((seed.presets ?? []).map((preset) => [preset.preset, preset]));
    this.spgNftContract = seed.spgNftContract ?? null;
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async getAsset(assetId: string): Promise<AssetRow | null> {
    return this.asset.id === assetId ? { ...this.asset } : null;
  }

  async getCreator(creatorId: string): Promise<CreatorRow | null> {
    return this.creator.id === creatorId ? this.creator : null;
  }

  async getLatestConsent(): Promise<ConsentRow | null> {
    return this.consent;
  }

  async putLabels(_assetId: string, labels: readonly LabelInput[]): Promise<void> {
    for (const label of labels) this.labels.set(`${label.namespace}:${label.key}`, label.value);
  }

  async getLabels(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.labels);
  }

  async createListing(input: {
    assetId: string;
    licensePreset: string;
    licenseTermsId: bigint;
    priceWei: bigint;
    currencyAddress: `0x${string}`;
  }): Promise<ListingRow> {
    const existing = this.listings.find(
      (listing) => listing.assetId === input.assetId && listing.licensePreset === input.licensePreset,
    );
    if (existing) return existing;
    const listing: ListingRow = { id: this.nextId("listing"), status: "active", ...input };
    this.listings.push(listing);
    return listing;
  }

  async getListing(assetId: string, licensePreset: string): Promise<ListingRow | null> {
    return (
      this.listings.find(
        (listing) => listing.assetId === assetId && listing.licensePreset === licensePreset,
      ) ?? null
    );
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
    const sale: SaleRow = {
      ...input,
      licenseTokenIds: [...input.licenseTokenIds],
      id: this.nextId("sale"),
    };
    this.sales.push(sale);
    return sale;
  }

  async getSale(assetId: string): Promise<SaleRow | null> {
    return [...this.sales].reverse().find((sale) => sale.assetId === assetId) ?? null;
  }

  async creditPayout(input: {
    saleId: string;
    creatorId: string;
    amountWei: bigint;
    currencyAddress: `0x${string}`;
    paymentCreditedAt: Date;
  }): Promise<PayoutRow> {
    const payout: PayoutRow = {
      id: this.nextId("payout"),
      saleId: input.saleId,
      creatorId: input.creatorId,
      amountWei: input.amountWei,
      currencyAddress: input.currencyAddress,
      status: "credited",
      paymentCreditedAt: input.paymentCreditedAt,
    };
    this.payouts.push(payout);
    return payout;
  }

  async getPayout(saleId: string): Promise<PayoutRow | null> {
    return [...this.payouts].reverse().find((payout) => payout.saleId === saleId) ?? null;
  }

  async listEvents(assetId: string): Promise<AssetEvent[]> {
    return this.events.filter((event) => event.assetId === assetId).map((event) => ({ ...event }));
  }

  async appendEvent(input: AppendEventInput): Promise<AssetEvent> {
    if (input.idempotencyKey) {
      const existing = this.events.find(
        (event) =>
          event.assetId === input.assetId && event.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return { ...existing };
    }
    const event: AssetEvent = {
      id: this.events.length + 1,
      assetId: input.assetId,
      seq: this.events.filter((entry) => entry.assetId === input.assetId).length + 1,
      eventType: input.eventType,
      payload: input.payload ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
      promotedToTrace: input.promotedToTrace ?? false,
      traceSeq: input.traceSeq ?? null,
      createdAt: new Date(0),
    };
    this.events.push(event);
    return { ...event };
  }

  async updateAssetProjection(
    assetId: string,
    patch: Partial<Omit<AssetRow, "id" | "creatorId">>,
  ): Promise<void> {
    if (this.asset.id !== assetId) return;
    this.asset = { ...this.asset, ...patch };
  }

  async setStage(assetId: string, stage: AssetRow["stage"]): Promise<void> {
    if (this.asset.id === assetId) this.asset = { ...this.asset, stage };
  }

  async getLicensePreset(preset: string): Promise<LicensePresetRow | null> {
    return this.presets.get(preset) ?? null;
  }

  async getSpgNftContract(): Promise<`0x${string}` | null> {
    return this.spgNftContract;
  }
}
