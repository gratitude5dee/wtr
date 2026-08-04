import { describe, expect, it } from "vitest";

import {
  chunkCount,
  chunkIv,
  CIPHER_CHUNK_BYTES,
  ciphertextSize,
  decryptChunk,
  encryptChunk,
  GCM_TAG_BYTES,
  generateFileKey,
  importFileKey,
} from "../encrypt";

describe("client-side encryption", () => {
  it("round-trips a chunk, including through an exported/re-imported key", async () => {
    const { key, meta } = await generateFileKey();
    const plaintext = crypto.getRandomValues(new Uint8Array(1024));

    const sealed = await encryptChunk(key, meta.ivBaseHex, 0, plaintext);
    expect(sealed.byteLength).toBe(plaintext.byteLength + GCM_TAG_BYTES);
    // Ciphertext must not contain the plaintext.
    expect(Buffer.from(sealed).includes(Buffer.from(plaintext))).toBe(false);

    const restored = await importFileKey(meta);
    const opened = await decryptChunk(restored, meta.ivBaseHex, 0, sealed);
    expect(Buffer.from(opened).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("refuses to decrypt with the wrong chunk index (IV misuse is loud)", async () => {
    const { key, meta } = await generateFileKey();
    const sealed = await encryptChunk(key, meta.ivBaseHex, 3, new Uint8Array(16));
    await expect(decryptChunk(key, meta.ivBaseHex, 4, sealed)).rejects.toThrow();
  });

  it("derives a distinct IV per chunk from the same base", () => {
    const base = "00112233445566aa";
    const first = chunkIv(base, 0);
    const second = chunkIv(base, 1);
    expect(first).not.toEqual(second);
    expect(first.slice(0, 8)).toEqual(second.slice(0, 8));
    expect(first.byteLength).toBe(12);
  });

  it("sizes ciphertext as plaintext plus one tag per chunk", () => {
    expect(ciphertextSize(10)).toBe(10 + GCM_TAG_BYTES);
    expect(chunkCount(CIPHER_CHUNK_BYTES + 1)).toBe(2);
    expect(ciphertextSize(CIPHER_CHUNK_BYTES + 1)).toBe(
      CIPHER_CHUNK_BYTES + 1 + 2 * GCM_TAG_BYTES,
    );
  });
});
