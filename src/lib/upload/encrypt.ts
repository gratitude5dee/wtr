/**
 * Client-side encryption (goal.md stage 3a): the original is encrypted in the
 * browser with AES-256-GCM before any byte leaves the device. The key is
 * generated on-device and NEVER sent to WTR — the server stores ciphertext
 * only. Registration later seals the key into a license-gated vault.
 *
 * AES-GCM cannot stream, so files are encrypted per chunk: every chunk gets
 * its own IV derived from a random 8-byte base plus the chunk index, which
 * guarantees no (key, IV) pair ever repeats. Each encrypted chunk carries its
 * own 16-byte GCM tag, so ciphertext length = plaintext + 16 per chunk.
 */

export const CIPHER_CHUNK_BYTES = 8 * 1024 * 1024;
export const GCM_TAG_BYTES = 16;
const IV_BYTES = 12;

export interface FileKey {
  /** Extractable JWK so an interrupted upload can resume after a tab close. */
  jwk: JsonWebKey;
  /** 8-byte random IV base, hex. Not secret — stored alongside ciphertext. */
  ivBaseHex: string;
}

export function chunkIv(ivBaseHex: string, chunkIndex: number): Uint8Array {
  const iv = new Uint8Array(IV_BYTES);
  for (let i = 0; i < 8; i += 1) {
    iv[i] = parseInt(ivBaseHex.slice(i * 2, i * 2 + 2), 16);
  }
  // Big-endian chunk counter in the last 4 bytes.
  iv[8] = (chunkIndex >>> 24) & 0xff;
  iv[9] = (chunkIndex >>> 16) & 0xff;
  iv[10] = (chunkIndex >>> 8) & 0xff;
  iv[11] = chunkIndex & 0xff;
  return iv;
}

export async function generateFileKey(): Promise<{ key: CryptoKey; meta: FileKey }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const ivBase = crypto.getRandomValues(new Uint8Array(8));
  const ivBaseHex = Array.from(ivBase, (b) => b.toString(16).padStart(2, "0")).join("");
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return { key, meta: { jwk, ivBaseHex } };
}

export async function importFileKey(meta: FileKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", meta.jwk, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptChunk(
  key: CryptoKey,
  ivBaseHex: string,
  chunkIndex: number,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: chunkIv(ivBaseHex, chunkIndex) as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return new Uint8Array(sealed);
}

export async function decryptChunk(
  key: CryptoKey,
  ivBaseHex: string,
  chunkIndex: number,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: chunkIv(ivBaseHex, chunkIndex) as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(opened);
}

export function chunkCount(byteSize: number): number {
  return Math.max(1, Math.ceil(byteSize / CIPHER_CHUNK_BYTES));
}

export function ciphertextSize(byteSize: number): number {
  return byteSize + chunkCount(byteSize) * GCM_TAG_BYTES;
}
