import { describe, expect, it } from "vitest";

import { canonicalStringify, sha256Bytes, sha256Canonical } from "../canonical";
import { createIdempotencyKey } from "../idempotency";
import { encodeLicenseAccessAuxData, encodeLicenseReadConditionData } from "../../chain/conditions";
import { LICENSE_TOKEN } from "../../../../config/chain";

describe("canonical serialisation", () => {
  it("is independent of key insertion order", () => {
    expect(canonicalStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it("hashes equal state to an equal root", async () => {
    const first = await sha256Canonical({ b: 1, a: 2 });
    const second = await sha256Canonical({ a: 2, b: 1 });

    expect(first).toBe(second);
    expect(first).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of a byte string", async () => {
    expect(await sha256Bytes(new TextEncoder().encode("abc"))).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("idempotency keys", () => {
  it("is stable inside a window and changes across windows", async () => {
    const payload = { action: "register", assetId: "asset-1" };
    const inWindow = { windowSeconds: 600, now: 1_000_000_000 };

    expect(await createIdempotencyKey(payload, inWindow)).toBe(
      await createIdempotencyKey({ assetId: "asset-1", action: "register" }, inWindow),
    );
    expect(await createIdempotencyKey(payload, inWindow)).not.toBe(
      await createIdempotencyKey(payload, { windowSeconds: 600, now: 1_000_700_000 }),
    );
  });

  it("is at least 24 characters", async () => {
    expect((await createIdempotencyKey({ a: 1 })).length).toBeGreaterThanOrEqual(24);
  });
});

describe("CDR condition encodings", () => {
  it("encodes the read condition as (LICENSE_TOKEN, ipId)", () => {
    const ipId = "0x3333333333333333333333333333333333333333" as const;
    const encoded = encodeLicenseReadConditionData(ipId);

    expect(encoded).toBe(
      `0x${LICENSE_TOKEN.slice(2).toLowerCase().padStart(64, "0")}${ipId.slice(2).padStart(64, "0")}`,
    );
  });

  it("encodes license token ids as a uint256 array", () => {
    expect(encodeLicenseAccessAuxData([1n, 2n])).toMatch(/^0x[0-9a-f]+$/);
  });
});
