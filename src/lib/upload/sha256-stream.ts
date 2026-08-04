/**
 * Client-side content hashing (goal.md P0-2): `content_sha256` is computed in
 * the browser before any byte leaves the device — the whole provenance claim
 * rests on this hash, so a server-computed one is not acceptable.
 *
 * `crypto.subtle.digest` needs the entire buffer in memory, which a 2GB video
 * cannot afford, so large files stream through this incremental SHA-256
 * (FIPS 180-4). Both paths produce the identical digest; the test suite pins
 * them against each other.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256Stream {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly buffer = new Uint8Array(64);
  private readonly words = new Uint32Array(64);
  private buffered = 0;
  private totalBytes = 0;
  private finished = false;

  update(chunk: Uint8Array): this {
    if (this.finished) throw new Error("digest() already called");
    this.totalBytes += chunk.byteLength;
    let offset = 0;
    if (this.buffered > 0) {
      const take = Math.min(64 - this.buffered, chunk.byteLength);
      this.buffer.set(chunk.subarray(0, take), this.buffered);
      this.buffered += take;
      offset = take;
      if (this.buffered === 64) {
        this.compress(this.buffer, 0);
        this.buffered = 0;
      }
    }
    while (offset + 64 <= chunk.byteLength) {
      this.compress(chunk, offset);
      offset += 64;
    }
    if (offset < chunk.byteLength) {
      this.buffer.set(chunk.subarray(offset));
      this.buffered = chunk.byteLength - offset;
    }
    return this;
  }

  /** Hex digest, no 0x prefix — the shape stored in `asset.content_sha256`. */
  digest(): string {
    if (this.finished) throw new Error("digest() already called");
    this.finished = true;

    const bitLength = this.totalBytes * 8;
    const padding = new Uint8Array(this.buffered <= 55 ? 64 : 128);
    padding.set(this.buffer.subarray(0, this.buffered));
    padding[this.buffered] = 0x80;
    const view = new DataView(padding.buffer);
    // JS numbers hold 53 bits exactly — plenty for any real file's bit length.
    view.setUint32(padding.length - 8, Math.floor(bitLength / 2 ** 32));
    view.setUint32(padding.length - 4, bitLength >>> 0);
    for (let offset = 0; offset < padding.length; offset += 64) {
      this.compress(padding, offset);
    }

    return [...this.state].map((word) => word.toString(16).padStart(8, "0")).join("");
  }

  private compress(block: Uint8Array, offset: number): void {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** Whole-buffer files go through the platform digest; it is faster. */
export const SUBTLE_DIGEST_LIMIT = 128 * 1024 * 1024;

/**
 * Hash a Blob/File without ever holding more than one chunk in memory (unless
 * it is small enough for a single `crypto.subtle.digest` call).
 */
export async function hashBlobSha256(
  blob: Blob,
  onProgress?: (hashedBytes: number) => void,
): Promise<string> {
  if (blob.size <= SUBTLE_DIGEST_LIMIT) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    onProgress?.(blob.size);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const hasher = new Sha256Stream();
  const reader = blob.stream().getReader();
  let hashed = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    hashed += value.byteLength;
    onProgress?.(hashed);
  }
  return hasher.digest();
}
