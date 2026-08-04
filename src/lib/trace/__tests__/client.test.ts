import { describe, expect, it } from "vitest";

import {
  MAX_TRACE_UPDATES_PER_DATA_ID,
  TraceClient,
  TraceConflictError,
  TraceHttpError,
  TraceUpdateCapError,
  stableBatchId,
} from "../client";
import { TRACE_SCHEMA_VERSION, assertNoPii, type TraceDocument } from "../schema";

function makeDocument(overrides: Partial<TraceDocument> = {}): TraceDocument {
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    file: {
      content_sha256: `sha256:${"a".repeat(64)}`,
      mime_type: "audio/wav",
      media_category: "audio",
      size_bytes: 16,
    },
    contributor: { anon_id: "anon-abc", kyc_status: "verified", consent: null },
    app: { platform_name: "wtr" },
    timestamps: {
      originated_at: "2026-02-01T00:00:00.000Z",
      uploaded_at: "2026-02-01T00:00:00.000Z",
    },
    provider_payload: {},
    ...overrides,
  };
}

const registerParams = {
  sourceRecordId: "asset-1",
  occurredAt: "2026-02-01T00:00:00.000Z",
} as const;

function registerResponse(status: "accepted" | "duplicate" | "conflict" = "accepted") {
  return {
    items: [{ source_record_id: "asset-1", data_id: "d1", status }],
  };
}

interface Attempt {
  headers: Record<string, string>;
  body: unknown;
  url: string;
}

function makeFetch(responses: { status: number; body?: unknown }[]) {
  const attempts: Attempt[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const response = responses[Math.min(attempts.length, responses.length - 1)];
    attempts.push({
      url,
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

describe("TraceClient headers and endpoints", () => {
  it("sends X-API-Key, X-Provider and X-Batch-Id to /records:batch", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 202, body: registerResponse() }]);

    await client(fetchImpl).registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "batch-1",
    });

    expect(attempts[0].url).toBe(
      "https://staging-api.storyprotocol.net/webhook/v1/data-audit/records:batch",
    );
    expect(attempts[0].headers["X-API-Key"]).toBe("test-key");
    expect(attempts[0].headers["X-Provider"]).toBe("wtr");
    expect(attempts[0].headers["X-Batch-Id"]).toBe("batch-1");
  });

  it("sends a single-item JSON array with source_record_id, root and occurred_at", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 202, body: registerResponse() }]);

    const result = await client(fetchImpl).registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "b",
    });

    const body = attempts[0].body as Record<string, unknown>[];
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].source_record_id).toBe("asset-1");
    expect(body[0].occurred_at).toBe("2026-02-01T00:00:00.000Z");
    expect(body[0].initial_metadata_root).toBe(result.initialMetadataRoot);
    expect(result.initialMetadataRoot).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((body[0].initial_metadata_json as TraceDocument).file.content_sha256).toBe(
      `sha256:${"a".repeat(64)}`,
    );
  });

  it("keeps the batch id identical across retries", async () => {
    const { fetchImpl, attempts } = makeFetch([
      { status: 503 },
      { status: 503 },
      { status: 202, body: registerResponse() },
    ]);

    await client(fetchImpl).registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "batch-stable",
    });

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

describe("TraceClient registration statuses", () => {
  it("treats a duplicate item as success with the existing data_id", async () => {
    const { fetchImpl } = makeFetch([{ status: 200, body: registerResponse("duplicate") }]);

    const result = await client(fetchImpl).registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "b",
    });

    expect(result.dataId).toBe("d1");
    expect(result.status).toBe("duplicate");
  });

  it("surfaces a conflict (same source_record_id, different metadata) without retrying", async () => {
    const { fetchImpl, attempts } = makeFetch([
      { status: 409, body: registerResponse("conflict") },
    ]);

    await expect(
      client(fetchImpl).registerData({ document: makeDocument(), ...registerParams, batchId: "b" }),
    ).rejects.toBeInstanceOf(TraceConflictError);
    expect(attempts).toHaveLength(1);
  });
});

describe("TraceClient retry policy", () => {
  it.each([429, 502, 503, 504])("retries %i", async (status) => {
    const { fetchImpl, attempts } = makeFetch([
      { status },
      { status: 202, body: registerResponse() },
    ]);

    const result = await client(fetchImpl).registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "b",
    });

    expect(result.dataId).toBe("d1");
    expect(attempts).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 422])("never retries %i", async (status) => {
    const { fetchImpl, attempts } = makeFetch([{ status, body: { error: "nope" } }]);

    await expect(
      client(fetchImpl).registerData({ document: makeDocument(), ...registerParams, batchId: "b" }),
    ).rejects.toBeInstanceOf(TraceHttpError);
    expect(attempts).toHaveLength(1);
  });

  it("gives up after maxAttempts and surfaces the last error", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 503 }]);

    await expect(
      client(fetchImpl, 3).registerData({
        document: makeDocument(),
        ...registerParams,
        batchId: "b",
      }),
    ).rejects.toBeInstanceOf(TraceHttpError);
    expect(attempts).toHaveLength(3);
  });
});

describe("TraceClient metadata updates", () => {
  const updateResponse = { items: [{ data_id: "d1", seq: 4, status: "accepted" }] };

  it("sends full state with a chained prev_metadata_root and seq = updateCount + 1", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 202, body: updateResponse }]);
    const prev = `sha256:${"c".repeat(64)}` as const;

    const result = await client(fetchImpl).updateMetadata({
      dataId: "d1",
      document: makeDocument({
        timestamps: {
          originated_at: "2026-02-01T00:00:00.000Z",
          uploaded_at: "2026-02-01T00:00:00.000Z",
          payment_credited_at: "2026-02-01T00:00:00.000Z",
        },
      }),
      prevMetadataRoot: prev,
      updateCount: 3,
      occurredAt: "2026-02-01T00:00:00.000Z",
      batchId: "b",
    });

    expect(attempts[0].url).toBe(
      "https://staging-api.storyprotocol.net/webhook/v1/data-audit/metadata-updates:batch",
    );
    const body = (attempts[0].body as Record<string, unknown>[])[0];
    expect(body.data_id).toBe("d1");
    expect(body.seq).toBe(4);
    expect(body.prev_metadata_root).toBe(prev);
    expect(body.metadata_root).toBe(result.metadataRoot);
    expect(body.occurred_at).toBe("2026-02-01T00:00:00.000Z");
    // Full document, not a diff.
    expect((body.metadata_json as TraceDocument).file.content_sha256).toBe(
      `sha256:${"a".repeat(64)}`,
    );
    expect(result.updateCount).toBe(4);
  });

  it("refuses to exceed the per-data_id update cap", async () => {
    const { fetchImpl, attempts } = makeFetch([{ status: 202, body: updateResponse }]);

    await expect(
      client(fetchImpl).updateMetadata({
        dataId: "d1",
        document: makeDocument(),
        prevMetadataRoot: `sha256:${"c".repeat(64)}`,
        updateCount: MAX_TRACE_UPDATES_PER_DATA_ID,
        occurredAt: "2026-02-01T00:00:00.000Z",
        batchId: "b",
      }),
    ).rejects.toBeInstanceOf(TraceUpdateCapError);
    expect(attempts).toHaveLength(0);
  });

  it("surfaces an update conflict without retrying", async () => {
    const { fetchImpl, attempts } = makeFetch([
      { status: 409, body: { items: [{ data_id: "d1", seq: 1, status: "conflict" }] } },
    ]);

    await expect(
      client(fetchImpl).updateMetadata({
        dataId: "d1",
        document: makeDocument(),
        prevMetadataRoot: `sha256:${"c".repeat(64)}`,
        updateCount: 0,
        occurredAt: "2026-02-01T00:00:00.000Z",
        batchId: "b",
      }),
    ).rejects.toBeInstanceOf(TraceConflictError);
    expect(attempts).toHaveLength(1);
  });

  it("produces a deterministic metadata root for identical state", async () => {
    const { fetchImpl } = makeFetch([{ status: 202, body: registerResponse() }]);
    const trace = client(fetchImpl);

    const first = await trace.registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "b",
    });
    const second = await trace.registerData({
      document: makeDocument(),
      ...registerParams,
      batchId: "b",
    });

    expect(first.initialMetadataRoot).toBe(second.initialMetadataRoot);
  });
});

describe("PII guard", () => {
  it("rejects a document carrying an email or name", () => {
    expect(() =>
      assertNoPii(makeDocument({ provider_payload: { contributor_email: "a@b.c" } })),
    ).toThrow(/PII/);
    expect(() => assertNoPii(makeDocument({ provider_payload: { full_name: "A B" } }))).toThrow(
      /PII/,
    );
  });

  it("accepts an anon_id-only contributor and the platform_name field", () => {
    expect(() => assertNoPii(makeDocument())).not.toThrow();
  });
});
