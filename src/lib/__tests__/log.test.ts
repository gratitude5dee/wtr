import { describe, expect, it } from "vitest";

import { REDACTED, redact } from "../log";
import { formatWei, toWei, weiFromDb, weiToDb } from "../money";

describe("log redaction", () => {
  it("redacts anything key-shaped", () => {
    const output = redact({
      privateKey: "0xdeadbeef",
      dataKey: "secret-material",
      apiKey: "k",
      password: "p",
      plaintext: "lyrics",
      nested: { decryptionKey: "x", authorization: "Bearer y" },
    });

    expect(Object.values(output)).not.toContain("0xdeadbeef");
    expect(output.privateKey).toBe(REDACTED);
    expect(output.dataKey).toBe(REDACTED);
    expect(output.apiKey).toBe(REDACTED);
    expect(output.password).toBe(REDACTED);
    expect(output.plaintext).toBe(REDACTED);
    expect(output.nested).toEqual({ decryptionKey: REDACTED, authorization: REDACTED });
  });

  it("replaces byte arrays with a length marker", () => {
    const output = redact({ media: new Uint8Array([1, 2, 3, 4]) });

    expect(output.media).toBe("[bytes len=4]");
  });

  it("keeps operational identifiers readable", () => {
    const output = redact({ assetId: "asset-1", ipId: "0xabc", licenseTokenIds: ["1", "2"] });

    expect(output).toEqual({ assetId: "asset-1", ipId: "0xabc", licenseTokenIds: ["1", "2"] });
  });

  it("serialises bigints without precision loss", () => {
    const output = redact({ amount: 12345678901234567890n });

    expect(output.amount).toBe("12345678901234567890n");
  });
});

describe("money", () => {
  it("round-trips wei through the database representation", () => {
    const amount = 123456789012345678901234567890n;

    expect(weiFromDb(weiToDb(amount))).toBe(amount);
  });

  it("formats only at the render boundary", () => {
    expect(formatWei(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(toWei("1.5")).toBe(1_500_000_000_000_000_000n);
  });

  it("treats a missing amount as zero", () => {
    expect(weiFromDb(null)).toBe(0n);
    expect(weiFromDb(undefined)).toBe(0n);
  });
});
