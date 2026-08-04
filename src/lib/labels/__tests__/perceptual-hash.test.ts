import { describe, expect, it } from "vitest";

import { ahash64, dhash64, hammingDistance64, HASH64_HEX, phash64 } from "../perceptual-hash";

function gradient(w: number, h: number): number[] {
  return Array.from({ length: w * h }, (_, i) => ((i % w) / (w - 1)) * 255);
}

describe("ahash64", () => {
  it("produces 16 lowercase hex characters", () => {
    expect(ahash64(gradient(8, 8))).toMatch(HASH64_HEX);
  });

  it("is deterministic and sensitive to content", () => {
    const a = ahash64(gradient(8, 8));
    expect(ahash64(gradient(8, 8))).toBe(a);
    const inverted = gradient(8, 8).map((v) => 255 - v);
    expect(ahash64(inverted)).not.toBe(a);
  });

  it("rejects wrong input sizes", () => {
    expect(() => ahash64([1, 2, 3])).toThrow(/64/);
  });
});

describe("dhash64", () => {
  it("encodes horizontal gradients as all-ones or all-zeros", () => {
    // Strictly increasing left-to-right: every left pixel is darker.
    expect(dhash64(gradient(9, 8))).toBe("0000000000000000");
    const decreasing = gradient(9, 8).map((v) => 255 - v);
    expect(dhash64(decreasing)).toBe("ffffffffffffffff");
  });

  it("rejects wrong input sizes", () => {
    expect(() => dhash64(gradient(8, 8))).toThrow(/72/);
  });
});

describe("phash64", () => {
  it("produces 16 lowercase hex characters and is deterministic", () => {
    const a = phash64(gradient(32, 32));
    expect(a).toMatch(HASH64_HEX);
    expect(phash64(gradient(32, 32))).toBe(a);
  });

  it("keeps similar images close and different images far", () => {
    // Deterministic pseudo-random "photo" so every DCT coefficient carries
    // real signal (a pure gradient leaves most coefficients as float noise).
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const base = Array.from({ length: 1024 }, () => rand() * 255);
    // Small uniform brightness shift: perceptually the same image.
    const brighter = base.map((v) => Math.min(255, v + 5));
    const different = Array.from({ length: 1024 }, () => rand() * 255);
    const h = phash64(base);
    expect(hammingDistance64(h, phash64(brighter))).toBeLessThanOrEqual(6);
    expect(hammingDistance64(h, phash64(different))).toBeGreaterThan(16);
  });

  it("rejects wrong input sizes", () => {
    expect(() => phash64(gradient(8, 8))).toThrow(/1024/);
  });
});

describe("hammingDistance64", () => {
  it("counts differing bits", () => {
    expect(hammingDistance64("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance64("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance64("0000000000000000", "0000000000000001")).toBe(1);
  });

  it("rejects malformed hashes", () => {
    expect(() => hammingDistance64("xyz", "0000000000000000")).toThrow(/16-hex/);
  });
});
