import { describe, expect, it } from "vitest";

import { TraceClient, TraceConflictError } from "../client";
import { createMockTraceFetch } from "../mock";
import { TRACE_SCHEMA_VERSION, type TraceDocument } from "../schema";

function makeDocument(anonId: string): TraceDocument {
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    file: {
      content_sha256: `sha256:${"a".repeat(64)}`,
      mime_type: "audio/wav",
      media_category: "audio",
      size_bytes: 16,
    },
    contributor: { anon_id: anonId, kyc_status: "verified", consent: null },
    app: { platform_name: "wtr" },
    timestamps: {
      originated_at: "2026-02-01T00:00:00.000Z",
      uploaded_at: "2026-02-01T00:00:00.000Z",
    },
    provider_payload: {},
  };
}

const client = (fetchImpl: typeof fetch) =>
  new TraceClient({
    baseUrl: "https://staging-api.storyprotocol.net",
    apiKey: "mock-no-key",
    provider: "wtr",
    fetchImpl,
    sleep: async () => {},
    maxAttempts: 2,
    baseDelayMs: 1,
  });

const registerParams = {
  sourceRecordId: "asset-1",
  occurredAt: "2026-02-01T00:00:00.000Z",
  batchId: "b",
} as const;

describe("mock Trace transport", () => {
  it("returns a deterministic data_id for the same provider + source_record_id", async () => {
    const trace = client(createMockTraceFetch());
    const other = client(createMockTraceFetch());

    const first = await trace.registerData({ document: makeDocument("anon-1"), ...registerParams });
    const again = await other.registerData({
      document: makeDocument("anon-1"),
      ...registerParams,
    });

    expect(first.dataId).toBe(again.dataId);
    expect(first.dataId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.status).toBe("accepted");
  });

  it("treats an identical re-registration as duplicate, a changed one as conflict", async () => {
    const trace = client(createMockTraceFetch());

    const first = await trace.registerData({ document: makeDocument("anon-1"), ...registerParams });
    const dup = await trace.registerData({ document: makeDocument("anon-1"), ...registerParams });
    expect(dup.dataId).toBe(first.dataId);
    expect(dup.status).toBe("duplicate");

    await expect(
      trace.registerData({ document: makeDocument("anon-2"), ...registerParams }),
    ).rejects.toBeInstanceOf(TraceConflictError);
  });

  it("accepts chained full-state metadata updates and rejects a changed seq replay", async () => {
    const trace = client(createMockTraceFetch());
    const registered = await trace.registerData({
      document: makeDocument("anon-1"),
      ...registerParams,
    });

    const updated = await trace.updateMetadata({
      dataId: registered.dataId,
      document: makeDocument("anon-1"),
      prevMetadataRoot: registered.initialMetadataRoot,
      updateCount: 0,
      occurredAt: "2026-02-02T00:00:00.000Z",
      batchId: "b2",
    });
    expect(updated.updateCount).toBe(1);

    // Same seq, different content — the documented conflict case.
    await expect(
      trace.updateMetadata({
        dataId: registered.dataId,
        document: makeDocument("anon-3"),
        prevMetadataRoot: registered.initialMetadataRoot,
        updateCount: 0,
        occurredAt: "2026-02-03T00:00:00.000Z",
        batchId: "b3",
      }),
    ).rejects.toBeInstanceOf(TraceConflictError);
  });

  it("remembers updates that arrive before registration", async () => {
    const trace = client(createMockTraceFetch());
    const params = {
      dataId: "00000000-0000-4000-8000-000000000000",
      document: makeDocument("anon-1"),
      prevMetadataRoot: `sha256:${"e".repeat(64)}` as const,
      updateCount: 0,
      occurredAt: "2026-02-02T00:00:00.000Z",
      batchId: "b1",
    };

    const first = await trace.updateMetadata(params);
    expect(first.updateCount).toBe(1);
    // Identical resend is a duplicate (idempotent success)…
    await expect(trace.updateMetadata(params)).resolves.toBeDefined();
    // …but a different document at the same seq is a conflict.
    await expect(
      trace.updateMetadata({ ...params, document: makeDocument("anon-9") }),
    ).rejects.toBeInstanceOf(TraceConflictError);
  });

  it("stores provider policies", async () => {
    const trace = client(createMockTraceFetch());
    await expect(
      trace.pushProviderPolicy({ policy: { tos: {}, privacy_policy: {} }, batchId: "p1" }),
    ).resolves.toBeUndefined();
  });
});
