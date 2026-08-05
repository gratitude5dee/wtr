import { describe, expect, it } from "vitest";

import type { Queryable } from "../../db/pool";
import { closeRequest, createRequest, eligibleAssets, getRequest, RequestError } from "../service";

function fakeQueryable(rows: Record<string, unknown>[]): Queryable {
  return {
    query: async <T>(text: string) => {
      // createRequest checks the verified-lab gate before inserting.
      const result = text.includes("lab_verified") ? [{ lab_verified: true }] : rows;
      return { rows: result as T[], rowCount: result.length };
    },
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
        { asset_id: "a1", filename: "one.wav", submission_status: null, eligible: true },
        { asset_id: "a2", filename: null, submission_status: "pending", eligible: false },
      ]),
    );
    expect(assets).toEqual([
      { assetId: "a1", filename: "one.wav", submissionStatus: null, eligible: true },
      { assetId: "a2", filename: null, submissionStatus: "pending", eligible: false },
    ]);
  });
});

const requester = { id: "creator-1", anonId: "anon-1" };
const validInput = {
  title: "Field recordings",
  modality: "audio",
  notes: "urban rain",
  licensePreset: "WTR-TRAIN-NONEXCLUSIVE",
  budgetWei: 25n * 10n ** 18n,
  unitPriceWei: null,
  kycRequired: false,
  deadline: null,
  fundingMode: "none" as const,
  depositWei: null,
  amountPaidWei: 0n,
  dataShape: null,
  specialInstructions: null,
};

describe("createRequest", () => {
  it("inserts a valid request and returns its id", async () => {
    const id = await createRequest(requester, validInput, fakeQueryable([{ id: "req-1" }]));
    expect(id).toBe("req-1");
  });

  it.each([
    [{ title: "  " }, /title/],
    [{ modality: "hologram" }, /modality/],
    [{ licensePreset: "WTR-EVERYTHING" }, /license presets/],
    [{ budgetWei: 0n }, /budget/],
    [{ unitPriceWei: -1n }, /per-item price/],
    [{ deadline: new Date(Date.now() - 1000) }, /deadline/],
    [{ deadline: new Date("not-a-date") }, /valid deadline/],
    [{ fundingMode: "deposit" as const, depositWei: 1n, amountPaidWei: 1n }, /at least 10%/],
    [
      { fundingMode: "full" as const, amountPaidWei: 24n * 10n ** 18n },
      /exactly the budget/,
    ],
    [{ amountPaidWei: 1n }, /unfunded/],
  ] as const)("rejects bad input %#", async (patch, message) => {
    await expect(
      createRequest(requester, { ...validInput, ...patch }, fakeQueryable([{ id: "req-1" }])),
    ).rejects.toThrow(message);
  });

  it("rejects rather than inventing a row when the insert returns nothing", async () => {
    await expect(createRequest(requester, validInput, fakeQueryable([]))).rejects.toThrow();
  });
});

describe("closeRequest", () => {
  it("throws a RequestError when there is no open request owned by the caller", async () => {
    await expect(closeRequest("creator-1", "req-1", fakeQueryable([]))).rejects.toBeInstanceOf(
      RequestError,
    );
  });

  it("resolves when the request was closed", async () => {
    await expect(
      closeRequest("creator-1", "req-1", fakeQueryable([{ id: "req-1" }])),
    ).resolves.toBeUndefined();
  });
});
