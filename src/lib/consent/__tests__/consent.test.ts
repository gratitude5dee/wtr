import { describe, expect, it } from "vitest";

import type { Queryable } from "../../db/pool";
import {
  CURRENT_PRIVACY,
  CURRENT_TOS,
  documentSha256,
} from "../documents";
import { getActiveConsent, hasCurrentConsent } from "../service";

function fakeQueryable(rows: Record<string, unknown>[]): Queryable {
  return {
    query: async <T>() => ({ rows: rows as T[], rowCount: rows.length }),
  } as Queryable;
}

describe("consent documents", () => {
  it("hashes deterministically — the recorded hash is re-verifiable forever", async () => {
    const [first, second] = await Promise.all([
      documentSha256(CURRENT_TOS),
      documentSha256(CURRENT_TOS),
    ]);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes the ToS and privacy policy differently", async () => {
    expect(await documentSha256(CURRENT_TOS)).not.toBe(await documentSha256(CURRENT_PRIVACY));
  });
});

describe("consent gate", () => {
  it("no acceptance row → no consent", async () => {
    expect(await hasCurrentConsent("creator-1", fakeQueryable([]))).toBe(false);
  });

  it("an acceptance of the CURRENT documents passes the gate", async () => {
    const q = fakeQueryable([
      {
        id: "consent-1",
        document_version: CURRENT_TOS.version,
        privacy_version: CURRENT_PRIVACY.version,
        accepted_at: new Date(),
      },
    ]);
    expect(await hasCurrentConsent("creator-1", q)).toBe(true);
  });

  it("an acceptance of a SUPERSEDED version fails the gate but stays on record", async () => {
    const q = fakeQueryable([
      {
        id: "consent-1",
        document_version: "wtr-tos-2025-01",
        privacy_version: CURRENT_PRIVACY.version,
        accepted_at: new Date(),
      },
    ]);
    expect(await hasCurrentConsent("creator-1", q)).toBe(false);
    // The stale acceptance is still readable — historical assets point at it.
    expect(await getActiveConsent("creator-1", q)).not.toBeNull();
  });
});
