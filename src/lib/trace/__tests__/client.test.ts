import { describe, expect, it } from "vitest";

import {
  MAX_TRACE_UPDATES_PER_DATA_ID,
  TraceClient,
  TraceHttpError,
  TraceUpdateCapError,
  stableBatchId,
} from "../client";
import { TRACE_SCHEMA, assertNoPii, type TraceDocument } from "../schema";

function makeDocument(overrides: Partial<TraceDocument> = {}): TraceDocument {
  return {
    schema: TRACE_SCHEMA,
    asset: {
      ref: "asset-1",
      media_type: "audio/wav",
      content_sha256: "a".repeat(64),
      byte_size: 16,
      ipfs_cid: "bafyfake",
    },
    contributor: { anon_id: "anon-abc", kyc_status: "verified", consent: null },
    license: null,
    labels: {},
    chain: { chain_id: 1315, ip_id: null, cdr_vault_uuid: null },
    settlement: { payment_credited_at: null },
    takedown: null,
    provider_payload: {},
    ...overrides,
  };
}

interface Attempt {
  headers: Record<string, string>;
  body: unknown;
}

function makeFetch(responses: { status: number; body?: unknown }[]) {
  const attempts: Attempt[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const response = responses[Math.min(attempts.length, responses.length - 1)];
    attempts.push({
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => JSON.stringify(response.body ?? {}),
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, attempts };
}

const client = (fetchImpl: typeof fetch, maxAttempts = 4) =>
  new TraceClient({
    baseUrl: "https://staging-api.storyprotocol.net",
    apiKey: "test-key",
    provider: "wtr",
    fetchImpl,
    sleep: async () => {},
    random: () => 0.5,
    maxAttempts,
    baseDelayMs: 1,
  });

describe("TraceClient headers", () => {
  it("sends X-API-Key, X-Provider and X-Batch-Id", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 200, body: { data_id: "d1" } }]);

    await client(fetchImpl).registerData({ document: makeDocument(), batchId: "batch-1" });

    expect(attempts[0].headers["X-API-Key"]).toBe("test-key");
    expect(attempts[0].headers["X-Provider"]).toBe("wtr");
    expect(attempts[0].headers["X-Batch-Id"]).toBe("batch-1");
  });

  it("keeps the batch id identical across retries", async () => {
    const { fetchImpl, attempts } = makeFetch([
      { status: 503 },
      { status: 503 },
      { status: 200, body: { data_id: "d1" } },
    ]);

    await client(fetchImpl).registerData({ document: makeDocument(), batchId: "batch-stable" });

    expect(attempts).toHaveLength(3);
    expect(new Set(attempts.map((attempt) => attempt.headers["X-Batch-Id"]))).toEqual(
      new Set(["batch-stable"]),
    );
  });

  it("derives the same batch id for the same action every time", async () => {
    const first = await stableBatchId({ action: "trace.register", assetId: "asset-1" });
    const second = await stableBatchId({ assetId: "asset-1", action: "trace.register" });

    expect(first).toBe(second);
    expect(first).not.toBe(await stableBatchId({ action: "trace.register", assetId: "asset-2" }));
  });
});

describe("TraceClient retry policy", () => {
  it.each([429, 502, 503, 504])("retries %i", async (status) => {
    const { fetchImpl, attempts } = makeFetch([
      { status },
      { status: 200, body: { data_id: "d1" } },
    ]);

    const result = await client(fetchImpl).registerData({
      document: makeDocument(),
      batchId: "b",
    });

    expect(result.dataId).toBe("d1");
    expect(attempts).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 422])("never retries %i", async (status) => {
    const { fetchImpl, attempts } = makeFetch([{ status, body: { error: "nope" } }]);

    await expect(
      client(fetchImpl).registerData({ document: makeDocument(), batchId: "b" }),
    ).rejects.toBeInstanceOf(TraceHttpError);
    expect(attempts).toHaveLength(1);
  });

  it("gives up after maxAttempts and surfaces the last error", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 503 }]);

    await expect(
      client(fetchImpl, 3).registerData({ document: makeDocument(), batchId: "b" }),
    ).rejects.toBeInstanceOf(TraceHttpError);
    expect(attempts).toHaveLength(3);
  });
});

describe("TraceClient metadata updates", () => {
  it("sends full state with a chained prev_metadata_root", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 200, body: {} }]);
    const prev = `0x${"c".repeat(64)}` as const;

    const result = await client(fetchImpl).updateMetadata({
      dataId: "d1",
      document: makeDocument({ settlement: { payment_credited_at: "2026-02-01T00:00:00.000Z" } }),
      prevMetadataRoot: prev,
      updateCount: 3,
      batchId: "b",
    });

    const body = attempts[0].body as Record<string, unknown>;
    expect(body.prev_metadata_root).toBe(prev);
    expect(body.metadata_root).toBe(result.metadataRoot);
    // Full document, not a diff.
    expect((body.metadata as TraceDocument).asset.content_sha256).toBe("a".repeat(64));
    expect(result.updateCount).toBe(4);
  });

  it("refuses to exceed the per-data_id update cap", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 200, body: {} }]);

    await expect(
      client(fetchImpl).updateMetadata({
        dataId: "d1",
        document: makeDocument(),
        prevMetadataRoot: `0x${"c".repeat(64)}`,
        updateCount: MAX_TRACE_UPDATES_PER_DATA_ID,
        batchId: "b",
      }),
    ).rejects.toBeInstanceOf(TraceUpdateCapError);
    expect(attempts).toHaveLength(0);
  });

  it("produces a deterministic metadata root for identical state", async () => {
    const { fetchImpl } = makeFetch([{ status: 200, body: { data_id: "d1" } }]);
    const trace = client(fetchImpl);

    const first = await trace.registerData({ document: makeDocument(), batchId: "b" });
    const second = await trace.registerData({ document: makeDocument(), batchId: "b" });

    expect(first.initialMetadataRoot).toBe(second.initialMetadataRoot);
  });
});

describe("PII guard", () => {
  it("rejects a document carrying an email or name", () => {
    expect(() =>
      assertNoPii(makeDocument({ labels: { contributor_email: "a@b.c" } })),
    ).toThrow(/PII/);
    expect(() => assertNoPii(makeDocument({ provider_payload: { full_name: "A B" } }))).toThrow(
      /PII/,
    );
  });

  it("accepts an anon_id-only contributor", () => {
    expect(() => assertNoPii(makeDocument())).not.toThrow();
  });
});
