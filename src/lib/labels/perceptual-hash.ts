/**
 * 64-bit perceptual hashes (goal.md P0-3): ahash64 / dhash64 / phash64 for
 * every image and video keyframe. Pure math over grayscale arrays so the
 * same code runs in the browser (fed from a canvas) and in tests (fed
 * synthetic arrays). Hashes are content fingerprints, never secrets.
 */

/** 64 bits as 16 lowercase hex characters. */
export type Hash64 = string;

export const HASH64_HEX = /^[0-9a-f]{16}$/;

function bitsToHex(bits: readonly boolean[]): Hash64 {
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      value = (value << 1) | (bits[nibble * 4 + bit] ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

/** Average hash: 8×8 grayscale, each bit = pixel above the mean. */
export function ahash64(gray8x8: readonly number[]): Hash64 {
  if (gray8x8.length !== 64) throw new Error("ahash64 expects 64 grayscale values");
  const mean = gray8x8.reduce((sum, v) => sum + v, 0) / 64;
  return bitsToHex(gray8x8.map((v) => v > mean));
}

/** Difference hash: 9×8 grayscale, each bit = left pixel brighter than right. */
export function dhash64(gray9x8: readonly number[]): Hash64 {
  if (gray9x8.length !== 72) throw new Error("dhash64 expects 72 grayscale values");
  const bits: boolean[] = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits.push(gray9x8[y * 9 + x] > gray9x8[y * 9 + x + 1]);
    }
  }
  return bitsToHex(bits);
}

/**
 * DCT-based hash: 32×32 grayscale → 2D DCT-II → top-left 8×8 low-frequency
 * block (minus the DC term) thresholded at its median.
 */
export function phash64(gray32x32: readonly number[]): Hash64 {
  if (gray32x32.length !== 1024) throw new Error("phash64 expects 1024 grayscale values");
  const N = 32;
  const cosines: number[][] = [];
  for (let k = 0; k < 8; k += 1) {
    cosines.push(
      Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
    );
  }
  // Only the top-left 8×8 of the DCT is needed.
  const dct: number[] = [];
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0;
      for (let y = 0; y < N; y += 1) {
        for (let x = 0; x < N; x += 1) {
          sum += gray32x32[y * N + x] * cosines[u][y] * cosines[v][x];
        }
      }
      dct.push(sum);
    }
  }
  const ac = dct.slice(1);
  const sorted = [...ac].sort((a, b) => a - b);
  const median = (sorted[31] + sorted[32]) / 2;
  return bitsToHex([false, ...ac.map((v) => v > median)].slice(0, 64));
}

/** Hamming distance between two 64-bit hex hashes (similarity metric). */
export function hammingDistance64(a: Hash64, b: Hash64): number {
  if (!HASH64_HEX.test(a) || !HASH64_HEX.test(b)) throw new Error("expected 16-hex hashes");
  let distance = 0;
  for (let i = 0; i < 16; i += 1) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}
