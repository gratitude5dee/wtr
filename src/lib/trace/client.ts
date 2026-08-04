/**
 * Trace provider client, speaking the documented DATA Foundation audit API:
 *   - POST /webhook/v1/data-audit/records:batch           (registration)
 *   - POST /webhook/v1/data-audit/metadata-updates:batch  (full-state updates)
 *   - PUT  /webhook/v1/data-audit/provider-policy         (active policies)
 *
 * Headers on every write (goal.md §5): `X-API-Key`, `X-Provider: wtr` and an
 * `X-Batch-Id` that is STABLE across retries — the provider deduplicates on it,
 * so regenerating it per attempt would create duplicate registrations.
 *
 * Retry policy: 429/502/503/504 and transport failures are retried with
 * exponential backoff plus jitter. Any other 4xx is a permanent, caller-visible
 * failure — retrying an unchanged request that the provider already rejected
 * cannot succeed and only burns rate limit.
 */
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";
import { log } from "../log";

import { assertNoPii, metadataRoot, type Sha256Ref, type TraceDocument } from "./schema";

/** Trace caps metadata updates per `data_id` at `seq` 1–100 (all environments). */
export const MAX_TRACE_UPDATES_PER_DATA_ID = 100;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface TraceClientConfig {
  baseUrl: string;
  apiKey: string;
  provider: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface TraceRegisterResult {
  dataId: string;
  initialMetadataRoot: Sha256Ref;
  /** `accepted` for new work, `duplicate` when the identical payload already exists. */
  status: "accepted" | "duplicate";
}

export interface TraceUpdateResult {
  dataId: string;
  prevMetadataRoot: Sha256Ref;
  metadataRoot: Sha256Ref;
  updateCount: number;
}

interface BatchItemResponse {
  source_record_id?: string;
  data_id?: string;
  status?: string;
}

interface BatchResponse {
  items?: BatchItemResponse[];
}

export class TraceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(`Trace responded ${status}`);
    this.name = "TraceHttpError";
  }
}

export class TraceConflictError extends Error {
  constructor(readonly sourceRecordId: string) {
    super(
      `Trace rejected ${sourceRecordId} as a conflict: the same source_record_id ` +
        "already exists with different metadata",
    );
    this.name = "TraceConflictError";
  }
}

export class TraceUpdateCapError extends Error {
  constructor(readonly dataId: string) {
    super(`Trace update cap of ${MAX_TRACE_UPDATES_PER_DATA_ID} reached for data_id ${dataId}`);
    this.name = "TraceUpdateCapError";
  }
}

/**
 * Deterministic batch id: the same semantic action always produces the same
 * value, on this attempt and on every retry, in this process and the next.
 */
export async function stableBatchId(parts: Record<string, unknown>): Promise<string> {
  return stripHexPrefix(await sha256Canonical(parts)).slice(0, 32);
}

export class TraceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(private readonly config: TraceClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = config.random ?? Math.random;
    this.maxAttempts = config.maxAttempts ?? 5;
    this.baseDelayMs = config.baseDelayMs ?? 250;
  }

  /**
   * Register one record via `/records:batch` and receive its DATA
   * Foundation-generated `data_id`. `initial_metadata_root` is computed
   * locally over the canonical document, so the caller can verify what was
   * committed. Re-sending the same provider + `source_record_id` yields the
   * same `data_id`; the same id with different metadata is a conflict.
   */
  async registerData(params: {
    document: TraceDocument;
    sourceRecordId: string;
    occurredAt: string;
    batchId: string;
  }): Promise<TraceRegisterResult> {
    assertNoPii(params.document);
    const root = await metadataRoot(params.document);
    const response = await this.request<BatchResponse>({
      method: "POST",
      path: "/webhook/v1/data-audit/records:batch",
      batchId: params.batchId,
      // 409 means at least one item conflicted; per-item statuses are decoded below.
      acceptStatuses: [409],
      body: [
        {
          source_record_id: params.sourceRecordId,
          initial_metadata_root: root,
          initial_metadata_json: params.document,
          occurred_at: params.occurredAt,
        },
      ],
    });
    const item = response.items?.find((it) => it.source_record_id === params.sourceRecordId);
    if (item?.status === "conflict") throw new TraceConflictError(params.sourceRecordId);
    if (!item?.data_id) throw new Error("Trace register response did not contain a data_id");
    return {
      dataId: item.data_id,
      initialMetadataRoot: root,
      status: item.status === "duplicate" ? "duplicate" : "accepted",
    };
  }

  /**
   * Push a FULL-STATE metadata update via `/metadata-updates:batch`.
   * `prevMetadataRoot` chains this update onto the previous one, and `seq`
   * (`updateCount + 1`) is capped at 100 per `data_id`.
   */
  async updateMetadata(params: {
    dataId: string;
    document: TraceDocument;
    prevMetadataRoot: Sha256Ref;
    /** How many updates this `data_id` has already received. */
    updateCount: number;
    occurredAt: string;
    batchId: string;
  }): Promise<TraceUpdateResult> {
    if (params.updateCount >= MAX_TRACE_UPDATES_PER_DATA_ID) {
      throw new TraceUpdateCapError(params.dataId);
    }
    assertNoPii(params.document);
    const root = await metadataRoot(params.document);
    const response = await this.request<BatchResponse>({
      method: "POST",
      path: "/webhook/v1/data-audit/metadata-updates:batch",
      batchId: params.batchId,
      acceptStatuses: [409],
      body: [
        {
          data_id: params.dataId,
          seq: params.updateCount + 1,
          prev_metadata_root: params.prevMetadataRoot,
          metadata_root: root,
          // Full latest state, never a diff (each event verifies against its root).
          metadata_json: params.document,
          occurred_at: params.occurredAt,
        },
      ],
    });
    const item = response.items?.find((it) => it.data_id === params.dataId);
    if (item?.status === "conflict") throw new TraceConflictError(params.dataId);
    return {
      dataId: params.dataId,
      prevMetadataRoot: params.prevMetadataRoot,
      metadataRoot: root,
      updateCount: params.updateCount + 1,
    };
  }

  /**
   * Push WTR's active policy so the audit side can compare it against what
   * the UI displays (`GET /providers/wtr/policy` serves the same object).
   */
  async pushProviderPolicy(params: { policy: unknown; batchId: string }): Promise<void> {
    await this.request({
      method: "PUT",
      path: "/webhook/v1/data-audit/provider-policy",
      batchId: params.batchId,
      body: params.policy,
    });
  }

  private async request<T>(params: {
    method: "POST" | "GET" | "PUT";
    path: string;
    batchId: string;
    body?: unknown;
    /** Non-2xx statuses whose body the caller decodes itself (e.g. per-item 409s). */
    acceptStatuses?: readonly number[];
  }): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${params.path}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: params.method,
          headers: {
            "Content-Type": "application/json",
            // Secrets are passed straight to fetch and never logged.
            "X-API-Key": this.config.apiKey,
            "X-Provider": this.config.provider,
            // Stable across every attempt of this same semantic action.
            "X-Batch-Id": params.batchId,
          },
          body: params.body === undefined ? undefined : JSON.stringify(params.body),
        });

        if (response.ok || params.acceptStatuses?.includes(response.status)) {
          const text = await response.text();
          return (text ? JSON.parse(text) : {}) as T;
        }

        const body = await response.text().catch(() => "");
        const retryable = RETRYABLE_STATUS.has(response.status) || response.status >= 500;
        const error = new TraceHttpError(response.status, body, retryable);
        // A 4xx other than 429 will fail identically forever — surface it now.
        if (!retryable) throw error;
        lastError = error;
      } catch (error) {
        if (error instanceof TraceHttpError && !error.retryable) throw error;
        lastError = error;
      }

      if (attempt < this.maxAttempts) {
        const backoff = this.baseDelayMs * 2 ** (attempt - 1);
        const jitter = Math.floor(this.random() * backoff);
        log.warn("trace request failed, retrying", {
          path: params.path,
          attempt,
          delayMs: backoff + jitter,
        });
        await this.sleep(backoff + jitter);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
