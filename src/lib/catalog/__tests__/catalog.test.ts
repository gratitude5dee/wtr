import { describe, expect, it } from "vitest";

import type { Queryable } from "../../db/pool";
import { getCatalogItem, listCatalog } from "../service";

function fakeQueryable(rowSets: Record<string, unknown>[][]): Queryable {
  let call = 0;
  return {
    query: async <T>() => {
      const rows = rowSets[Math.min(call++, rowSets.length - 1)] ?? [];
      return { rows: rows as T[], rowCount: rows.length };
    },
  } as Queryable;
}

const listedRow = {
  asset_id: "a1",
  filename: "rain.wav",
  modality: "audio",
  preview_url: null,
  license_preset: "WTR-TRAIN-NONEXCLUSIVE",
  price_wei: "500000000000000000",
  creator_anon_id: "anon-1",
  listed_at: new Date("2026-08-01T00:00:00Z"),
};

describe("listCatalog", () => {
  it("keeps the price as bigint wei", async () => {
    const items = await listCatalog({}, fakeQueryable([[listedRow]]));
    expect(items).toHaveLength(1);
    expect(items[0].priceWei).toBe(500000000000000000n);
    expect(typeof items[0].priceWei).toBe("bigint");
  });

  it("returns empty when nothing is listed", async () => {
    expect(await listCatalog({}, fakeQueryable([[]]))).toEqual([]);
  });
});

describe("getCatalogItem", () => {
  it("returns null for an unknown or unlisted asset", async () => {
    expect(await getCatalogItem("a-missing", fakeQueryable([[]]))).toBeNull();
  });

  it("maps labels alongside the listing", async () => {
    const item = await getCatalogItem(
      "a1",
      fakeQueryable([
        [{ ...listedRow, creator_id: "creator-1", stage: "LISTED" }],
        [{ key: "genre", value: "ambient" }],
      ]),
    );
    expect(item?.stage).toBe("LISTED");
    expect(item?.labels).toEqual([{ key: "genre", value: "ambient" }]);
    expect(item?.priceWei).toBe(500000000000000000n);
  });
});
