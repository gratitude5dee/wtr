import { describe, expect, it } from "vitest";

import { REDACTED, redact, redactText } from "../log";
import { formatWei, toWei, weiFromDb, weiToDb } from "../money";

/** A 32-byte key: indistinguishable from a tx hash by shape alone. */
const KEY_HEX = `0x${"ab".repeat(32)}`;

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

  it("redacts the private key under the name this project actually uses", () => {
    const output = redact({ WTR_WALLET_PRIVATE_KEY: KEY_HEX, private_key: KEY_HEX });

    expect(output.WTR_WALLET_PRIVATE_KEY).toBe(REDACTED);
    expect(output.private_key).toBe(REDACTED);
  });

  it("redacts key-shaped values under field names it has never seen", () => {
    // Field names are open-ended, so the shape of the value has to be enough.
    for (const key of ["k", "sk", "pk", "signingKey", "keyMaterial", "wrappedDek", "blob", "raw"]) {
      expect(redact({ [key]: KEY_HEX })[key]).toBe(REDACTED);
    }
    expect(redact({ somethingNobodyAnticipated: KEY_HEX }).somethingNobodyAnticipated).toBe(
      REDACTED,
    );
  });

  it("redacts key material carried inside third-party error text", () => {
    // Stage handlers log `{ error: failure.message }`, and we do not control an
    // SDK's error wording.
    const output = redact({
      error: `rpc rejected signature for key ${KEY_HEX}`,
      cause: new Error(`vault write failed: dataKey=${KEY_HEX}`),
    });

    expect(output.error).not.toContain(KEY_HEX);
    expect(JSON.stringify(output.cause)).not.toContain(KEY_HEX);
    expect(output.error).toContain("rpc rejected signature");
  });

  it("redacts key material in the log message itself", () => {
    expect(redactText(`decrypting with ${KEY_HEX}`)).toBe(`decrypting with ${REDACTED}`);
  });

  it("keeps operational identifiers readable, in either spelling", () => {
    const txHash = `0x${"12".repeat(32)}`;
    // A content address published to IPFS: an operator has to be able to fetch it.
    const uri = "https://ipfs.io/ipfs/bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
    const output = redact({
      assetId: "asset-1",
      ipId: "0xabc",
      licenseTokenIds: ["1", "2"],
      // Hash-shaped but must stay legible, or an on-chain failure is untraceable.
      txHash,
      metadata_root: txHash,
      metadataRoot: txHash,
      uri,
    });

    expect(output).toEqual({
      assetId: "asset-1",
      ipId: "0xabc",
      licenseTokenIds: ["1", "2"],
      txHash,
      metadata_root: txHash,
      metadataRoot: txHash,
      uri,
    });
  });

  it("does not swallow a whole URL path when scrubbing free text", () => {
    // Redacting the whole URL would leave an operator unable to fetch the
    // document the log line is about.
    const scrubbed = redactText(
      `publish failed for https://ipfs.io/ipfs/bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy`,
    );

    expect(scrubbed).toContain("https://ipfs.io/ipfs/");
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
