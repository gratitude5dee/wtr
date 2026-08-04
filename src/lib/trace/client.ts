/**
 * Trace provider client.
 *
 * Headers on every request (goal.md §5): `X-API-Key`, `X-Provider: wtr` and an
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

import { TRACE_SCHEMA, assertNoPii, metadataRoot, type TraceDocument } from "./schema";

/** Trace caps metadata updates per `data_id` (goal.md §5). */
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
  initialMetadataRoot: `0x${string}`;
}

export interface TraceUpdateResult {
  dataId: string;
  prevMetadataRoot: `0x${string}`;
  metadataRoot: `0x${string}`;
  updateCount: number;
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
   * Register a document and receive its `data_id`. The
   * `initial_metadata_root` we send is computed locally, so the caller can
   * verify the provider echoed the same root back.
   */
  async registerData(params: {
    document: TraceDocument;
    batchId: string;
  }): Promise<TraceRegisterResult> {
    assertNoPii(params.document);
    const root = await metadataRoot(params.document);
    const response = await this.request<{ data_id?: string; dataId?: string }>({
      method: "POST",
      path: "/api/v4/trace/data",
      batchId: params.batchId,
      body: {
        schema: TRACE_SCHEMA,
        initial_metadata_root: root,
        provider_payload: params.document.provider_payload,
        metadata: params.document,
      },
    });
    const dataId = response.data_id ?? response.dataId;
    if (!dataId) throw new Error("Trace register response did not contain a data_id");
    return { dataId, initialMetadataRoot: root };
  }

  /**
   * Push a FULL-STATE metadata update. `prevMetadataRoot` chains this update
   * onto the previous one; the provider rejects a broken chain.
   */
  async updateMetadata(params: {
    dataId: string;
    document: TraceDocument;
    prevMetadataRoot: `0x${string}`;
    /** How many updates this `data_id` has already received. */
    updateCount: number;
    batchId: string;
  }): Promise<TraceUpdateResult> {
    if (params.updateCount >= MAX_TRACE_UPDATES_PER_DATA_ID) {
      throw new TraceUpdateCapError(params.dataId);
    }
    assertNoPii(params.document);
    const root = await metadataRoot(params.document);
    await this.request({
      method: "POST",
      path: `/api/v4/trace/data/${encodeURIComponent(params.dataId)}/metadata`,
      batchId: params.batchId,
      body: {
        schema: TRACE_SCHEMA,
        prev_metadata_root: params.prevMetadataRoot,
        metadata_root: root,
        // Full state, never a diff.
        metadata: params.document,
        provider_payload: params.document.provider_payload,
      },
    });
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

        if (response.ok) {
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
