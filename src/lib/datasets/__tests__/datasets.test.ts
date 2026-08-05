import { describe, expect, it } from "vitest";

import type { Queryable } from "../../db/pool";
import { buildExport, exportSnapshot, isExportTemplate } from "../export";
import {
  createDataset,
  DatasetError,
  getSnapshot,
  preferencePairsForAssets,
  previewDataset,
  snapshotMembers,
  takeSnapshot,
  trainingFilters,
  type DatasetMember,
  type DatasetRow,
  type DatasetSnapshotRow,
} from "../service";

interface Call {
  sql: string;
  params: readonly unknown[];
}

/** Sequential row sets, plus the SQL each call issued so we can assert guards. */
function fakeQueryable(rowSets: Record<string, unknown>[][]): Queryable & { calls: Call[] } {
  let call = 0;
  const calls: Call[] = [];
  return {
    calls,
    query: async <T>(sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const rows = rowSets[call++] ?? [];
      return { rows: rows as T[], rowCount: rows.length };
    },
  } as Queryable & { calls: Call[] };
}

function failingQueryable(error: unknown): Queryable {
  return { query: async () => { throw error; } } as unknown as Queryable;
}

const listedRow = {
  asset_id: "a1",
  filename: "rain.wav",
  modality: "audio",
  preview_url: "/api/assets/a1/preview",
  license_preset: "WTR-TRAIN-NONEXCLUSIVE",
  price_wei: "500000000000000000",
  creator_anon_id: "anon-1",
  creator_kyc_status: "verified",
  listed_at: new Date("2026-08-01T00:00:00Z"),
};

const dataset: DatasetRow = {
  id: "d1",
  ownerCreatorId: "c1",
  name: "Ambient audio v1",
  filters: { trainingOnly: true },
  createdAt: new Date("2026-08-01T00:00:00Z"),
  snapshotCount: 1,
};

const snapshot: DatasetSnapshotRow = {
  id: "11111111-2222-3333-4444-555555555555",
  datasetId: "d1",
  filters: { trainingOnly: true },
  assetIds: ["a1"],
  itemCount: 1,
  createdAt: new Date("2026-08-02T00:00:00Z"),
};

const member: DatasetMember = {
  assetId: "a1",
  filename: "rain.wav",
  modality: "audio",
  previewUrl: "/api/assets/a1/preview",
  licensePreset: "WTR-TRAIN-NONEXCLUSIVE",
  creatorAnonId: "anon-1",
  contentSha256: "a".repeat(64),
  ipId: "0xip",
  labels: { caption: "steady rain on a tin roof", genre: "ambient" },
};

describe("trainingFilters", () => {
  it("forces trainingOnly on and drops a NO-TRAIN preset", () => {
    expect(trainingFilters({ licensePreset: "WTR-NO-TRAIN", modality: "audio" })).toEqual({
      modality: "audio",
      licensePreset: undefined,
      search: undefined,
      kycOnly: undefined,
      trainingOnly: true,
    });
  });
});

describe("previewDataset", () => {
  it("never queries without the training-permitted guard", async () => {
    const q = fakeQueryable([[listedRow]]);
    const items = await previewDataset({ trainingOnly: false }, q);
    expect(items).toHaveLength(1);
    expect(q.calls[0].sql).toContain("l.license_preset <> 'WTR-NO-TRAIN'");
  });

  it("returns nothing when no assets match", async () => {
    expect(await previewDataset({ modality: "motion" }, fakeQueryable([[]]))).toEqual([]);
  });
});

describe("createDataset", () => {
  it("rejects an empty name", async () => {
    await expect(
      createDataset({ id: "c1" }, { name: "  ", filters: {} }, fakeQueryable([[]])),
    ).rejects.toBeInstanceOf(DatasetError);
  });

  it("reports a duplicate name rather than silently returning nothing", async () => {
    await expect(
      createDataset({ id: "c1" }, { name: "dupe", filters: {} }, fakeQueryable([[]])),
    ).rejects.toThrow(/already have a dataset/);
  });

  it("stores the normalized filters", async () => {
    const q = fakeQueryable([[{ id: "d1" }]]);
    await createDataset(
      { id: "c1" },
      { name: "Ambient", filters: { licensePreset: "WTR-NO-TRAIN" } },
      q,
    );
    expect(JSON.parse(String(q.calls[0].params[2]))).toMatchObject({ trainingOnly: true });
    expect(JSON.parse(String(q.calls[0].params[2])).licensePreset).toBeUndefined();
  });
});

describe("takeSnapshot", () => {
  it("refuses when nothing matches", async () => {
    const q = fakeQueryable([
      [{ id: "d1", owner_creator_id: "c1", name: "d", filters: {}, created_at: new Date(), snapshot_count: 0 }],
      [],
    ]);
    await expect(takeSnapshot("d1", q)).rejects.toThrow(/no training-licensed assets/);
  });

  it("refuses for an unknown dataset", async () => {
    await expect(takeSnapshot("nope", fakeQueryable([[]]))).rejects.toBeInstanceOf(DatasetError);
  });

  it("freezes the resolved membership", async () => {
    const q = fakeQueryable([
      [{ id: "d1", owner_creator_id: "c1", name: "d", filters: {}, created_at: new Date(), snapshot_count: 0 }],
      [listedRow],
      [
        {
          id: "s1",
          dataset_id: "d1",
          filters: { trainingOnly: true },
          asset_ids: ["a1"],
          item_count: 1,
          created_at: new Date("2026-08-02T00:00:00Z"),
        },
      ],
    ]);
    const taken = await takeSnapshot("d1", q);
    expect(taken.assetIds).toEqual(["a1"]);
    // Immutability: the only write is the INSERT — nothing updates an existing snapshot.
    const writes = q.calls.filter((c) => /INSERT|UPDATE|DELETE/.test(c.sql));
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain("INSERT INTO dataset_snapshot");
  });
});

describe("snapshotMembers", () => {
  it("re-excludes assets whose terms became NO-TRAIN after the snapshot", async () => {
    const q = fakeQueryable([[]]);
    expect(await snapshotMembers(snapshot, q)).toEqual([]);
    expect(q.calls[0].sql).toContain("l.license_preset <> 'WTR-NO-TRAIN'");
  });

  it("short-circuits an empty snapshot", async () => {
    const q = fakeQueryable([[]]);
    expect(await snapshotMembers({ ...snapshot, assetIds: [] }, q)).toEqual([]);
    expect(q.calls).toHaveLength(0);
  });
});

describe("preferencePairsForAssets", () => {
  it("degrades to empty when migration 0009 has not landed", async () => {
    const undefinedTable = Object.assign(new Error('relation "preference_pair" does not exist'), {
      code: "42P01",
    });
    expect(await preferencePairsForAssets(["a1"], failingQueryable(undefinedTable))).toEqual([]);
  });

  it("rethrows any other database error", async () => {
    await expect(
      preferencePairsForAssets(["a1"], failingQueryable(new Error("connection reset"))),
    ).rejects.toThrow(/connection reset/);
  });
});

describe("export templates", () => {
  const input = { dataset, snapshot, members: [member] };

  it("rejects an unknown template", () => {
    expect(isExportTemplate("parquet")).toBe(false);
    expect(() => buildExport("parquet", input)).toThrow(DatasetError);
  });

  it("builds SFT chat JSONL with provenance", () => {
    const result = buildExport("sft_jsonl", input);
    expect(result.lineCount).toBe(1);
    const record = JSON.parse(result.body);
    expect(record.messages[1].content).toBe("steady rain on a tin roof");
    expect(record.provenance.content_sha256).toBe(member.contentSha256);
    expect(result.filename).toMatch(/^ambient-audio-v1-11111111-sft_jsonl\.jsonl$/);
  });

  it("builds caption pairs against the degraded preview only", () => {
    const record = JSON.parse(buildExport("caption_pairs", input).body);
    expect(record.preview_url).toBe("/api/assets/a1/preview");
    expect(JSON.stringify(record)).not.toContain("ciphertext");
  });

  it("skips members with no caption material", () => {
    const bare = { ...member, labels: {} };
    expect(buildExport("sft_jsonl", { ...input, members: [bare] }).lineCount).toBe(0);
  });

  it("builds DPO pairs from the preference_pair contract shape", () => {
    const result = buildExport("dpo_pairs", {
      ...input,
      preferencePairs: [
        {
          prompt: "p",
          chosen: "a",
          rejected: "b",
          confidence: 0.8,
          jurors: ["j1"],
          assetId: "a1",
        },
      ],
    });
    expect(result.lineCount).toBe(1);
    expect(JSON.parse(result.body)).toMatchObject({ chosen: "a", rejected: "b", confidence: 0.8 });
  });

  it("degrades to an empty DPO export with no pairs", () => {
    const result = buildExport("dpo_pairs", input);
    expect(result.body).toBe("");
    expect(result.lineCount).toBe(0);
    expect(result.card).toContain("No preference pairs");
  });
});

describe("dataset card", () => {
  it("states the license posture and cites content hashes", () => {
    const card = buildExport("sft_jsonl", { dataset, snapshot, members: [member] }).card;
    expect(card).toContain("WTR-TRAIN-NONEXCLUSIVE: 1");
    expect(card).toContain(member.contentSha256);
    expect(card).toContain("anon-1");
  });

  it("carries no filenames or other PII-shaped fields", () => {
    const card = buildExport("caption_pairs", { dataset, snapshot, members: [member] }).card;
    expect(card).not.toContain("rain.wav");
  });

  it("rejects a trace document carrying PII", () => {
    expect(() =>
      buildExport("sft_jsonl", {
        dataset,
        snapshot,
        members: [member],
        traceDocuments: [
          {
            schema_version: "trace-v1.0",
            file: {
              content_sha256: `sha256:${"a".repeat(64)}`,
              mime_type: "audio/wav",
              media_category: "audio",
              size_bytes: 1,
            },
            contributor: { anon_id: "anon-1", kyc_status: "verified", consent: null },
            app: { platform_name: "wtr" },
            timestamps: { originated_at: "x", uploaded_at: "x" },
            provider_payload: { email: "someone@example.com" },
          },
        ],
      }),
    ).toThrow(/PII/);
  });
});

describe("exportSnapshot", () => {
  it("rejects an unknown template before touching the database", async () => {
    await expect(exportSnapshot("s1", "parquet", fakeQueryable([]))).rejects.toBeInstanceOf(
      DatasetError,
    );
  });

  it("drops preference pairs for an asset whose terms became NO-TRAIN", async () => {
    const q = fakeQueryable([
      [
        {
          id: snapshot.id,
          dataset_id: "d1",
          filters: {},
          asset_ids: ["a1"],
          item_count: 1,
          created_at: new Date("2026-08-02T00:00:00Z"),
        },
      ],
      [{ id: "d1", owner_creator_id: "c1", name: "d", filters: {}, created_at: new Date(), snapshot_count: 1 }],
      // snapshotMembers re-applies the guard and drops the asset.
      [],
    ]);
    const result = await exportSnapshot(snapshot.id, "dpo_pairs", q);
    expect(result.lineCount).toBe(0);
    expect(q.calls.some((c) => c.sql.includes("preference_pair"))).toBe(false);
  });

  it("reports a missing snapshot", async () => {
    await expect(exportSnapshot("s1", "sft_jsonl", fakeQueryable([[]]))).rejects.toThrow(
      /no longer exists/,
    );
  });
});

describe("getSnapshot", () => {
  it("returns null for an unknown id", async () => {
    expect(await getSnapshot("nope", fakeQueryable([[]]))).toBeNull();
  });
});
