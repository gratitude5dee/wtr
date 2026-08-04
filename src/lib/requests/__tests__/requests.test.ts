import { describe, expect, it } from "vitest";

import type { Queryable } from "../../db/pool";
import { eligibleAssets, getRequest } from "../service";

function fakeQueryable(rows: Record<string, unknown>[]): Queryable {
  return {
    query: async <T>() => ({ rows: rows as T[], rowCount: rows.length }),
  } as Queryable;
}

describe("getRequest", () => {
  it("returns null for an unknown request", async () => {
    expect(await getRequest("11111111-1111-1111-1111-111111111111", fakeQueryable([]))).toBeNull();
  });

  it("keeps the budget as bigint wei", async () => {
    const request = await getRequest(
      "11111111-1111-1111-1111-111111111111",
      fakeQueryable([
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Field recordings",
          spec: { modality: "audio" },
          license_preset: "WTR-TRAIN-NONEXCLUSIVE",
          budget_wei: "25000000000000000000",
          status: "open",
          created_at: new Date(),
        },
      ]),
    );
    expect(request?.budgetWei).toBe(25000000000000000000n);
    expect(typeof request?.budgetWei).toBe("bigint");
  });
});

describe("eligibleAssets", () => {
  it("maps submission status through, null when never submitted", async () => {
    const assets = await eligibleAssets(
      "creator-1",
      "request-1",
      fakeQueryable([
        { asset_id: "a1", filename: "one.wav", submission_status: null },
        { asset_id: "a2", filename: null, submission_status: "pending" },
      ]),
    );
    expect(assets).toEqual([
      { assetId: "a1", filename: "one.wav", submissionStatus: null },
      { assetId: "a2", filename: null, submissionStatus: "pending" },
    ]);
  });
});
