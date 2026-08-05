import { describe, expect, it } from "vitest";

import { ACCEPT_ATTRIBUTE, modalityForFilename } from "../modality";
import { hashBlobSha256, Sha256Stream } from "../sha256-stream";

async function subtleHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 65536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, length)));
  }
  return bytes;
}

describe("streaming SHA-256 matches crypto.subtle exactly", () => {
  // Content hashes anchor provenance: the streamed path for big files must
  // produce byte-identical digests to the platform digest for small ones.
  const sizes = [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000003];

  for (const size of sizes) {
    it(`for ${size} bytes`, async () => {
      const bytes = randomBytes(size);
      const streamed = new Sha256Stream().update(bytes).digest();
      expect(streamed).toBe(await subtleHex(bytes));
    });
  }

  it("regardless of chunk boundaries", async () => {
    const bytes = randomBytes(300000);
    const hasher = new Sha256Stream();
    let offset = 0;
    const chunkSizes = [1, 7, 63, 64, 65, 4096, 100000];
    let index = 0;
    while (offset < bytes.length) {
      const size = chunkSizes[index++ % chunkSizes.length];
      hasher.update(bytes.subarray(offset, offset + size));
      offset += size;
    }
    expect(hasher.digest()).toBe(await subtleHex(bytes));
  });

  it("via hashBlobSha256 with progress", async () => {
    const bytes = randomBytes(70000);
    const progress: number[] = [];
    const hex = await hashBlobSha256(new Blob([bytes.slice()]), (hashed) => progress.push(hashed));
    expect(hex).toBe(await subtleHex(bytes));
    expect(progress.at(-1)).toBe(70000);
  });
});

describe("modality mapping (goal.md P0-2)", () => {
  it("maps every listed extension", () => {
    expect(modalityForFilename("take-1.WAV")).toBe("audio");
    expect(modalityForFilename("clip.mov")).toBe("video");
    expect(modalityForFilename("art.avif")).toBe("image");
    expect(modalityForFilename("model.usdz")).toBe("threed");
    expect(modalityForFilename("walk.lottie")).toBe("motion");
    expect(modalityForFilename("bounce.lottie.json")).toBe("motion");
    expect(modalityForFilename("session.jsonl")).toBe("agenttrace");
    expect(modalityForFilename("rollout.json")).toBe("agenttrace");
  });

  it("keeps .json unambiguous between lottie and agent traces", () => {
    expect(modalityForFilename("Bounce.LOTTIE.JSON")).toBe("motion");
    expect(modalityForFilename("hermes-trace.json")).toBe("agenttrace");
    expect(modalityForFilename("trace.JSONL")).toBe("agenttrace");
  });

  it("rejects everything else", () => {
    expect(modalityForFilename("malware.exe")).toBeNull();
    expect(modalityForFilename("noextension")).toBeNull();
  });

  it("offers both trace extensions in the file picker", () => {
    expect(ACCEPT_ATTRIBUTE.split(",")).toEqual(expect.arrayContaining([".jsonl", ".json"]));
  });
});
