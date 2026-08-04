/**
 * Browser side of the resumable encrypted upload. The plaintext never leaves
 * the device: each chunk is AES-GCM sealed in the browser, then PUT to the
 * ciphertext endpoint at its exact offset. The file key lives in
 * localStorage (per asset) so an interrupted upload resumes after a tab
 * close — the creator re-drops the same file, the hash dedupes to the same
 * asset, and upload continues from the server's recorded offset.
 */
import {
  CIPHER_CHUNK_BYTES,
  ciphertextSize,
  encryptChunk,
  type FileKey,
  GCM_TAG_BYTES,
  generateFileKey,
  importFileKey,
} from "./encrypt";

const KEY_PREFIX = "wtr-filekey-v1:";

function loadKeyMeta(assetId: string): FileKey | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${assetId}`);
    return raw ? (JSON.parse(raw) as FileKey) : null;
  } catch {
    return null;
  }
}

async function keyForAsset(assetId: string): Promise<{ key: CryptoKey; meta: FileKey }> {
  const existing = loadKeyMeta(assetId);
  if (existing) return { key: await importFileKey(existing), meta: existing };
  const fresh = await generateFileKey();
  localStorage.setItem(`${KEY_PREFIX}${assetId}`, JSON.stringify(fresh.meta));
  return fresh;
}

interface UploadStatus {
  totalBytes: number | null;
  received: number;
  ivBase: string | null;
  complete: boolean;
}

export async function uploadEncrypted(
  assetId: string,
  file: File,
  onProgress: (sentBytes: number, totalBytes: number) => void,
): Promise<void> {
  const { key, meta } = await keyForAsset(assetId);
  const totalCipherBytes = ciphertextSize(file.size);

  const statusResponse = await fetch(`/api/assets/${assetId}/ciphertext`);
  if (!statusResponse.ok) throw new Error("could not read upload status");
  const status = (await statusResponse.json()) as UploadStatus;
  if (status.complete) {
    onProgress(totalCipherBytes, totalCipherBytes);
    return;
  }
  if (status.received > 0 && status.ivBase !== meta.ivBaseHex) {
    // The upload was begun under different key material (e.g. localStorage
    // was cleared, or a different browser). Appending chunks sealed with a
    // new key would silently produce a permanently unopenable file.
    throw new Error(
      "this upload was started on another device or the key was cleared — it cannot be resumed here",
    );
  }

  // Every chunk is plaintext CIPHER_CHUNK_BYTES + a GCM tag, so the resume
  // offset maps back to a chunk index exactly.
  const sealedChunkBytes = CIPHER_CHUNK_BYTES + GCM_TAG_BYTES;
  let chunkIndex = Math.floor(status.received / sealedChunkBytes);
  let offset = status.received;
  if (offset % sealedChunkBytes !== 0) throw new Error("server offset is not chunk-aligned");

  while (offset < totalCipherBytes) {
    const plainStart = chunkIndex * CIPHER_CHUNK_BYTES;
    const plain = new Uint8Array(
      await file.slice(plainStart, Math.min(plainStart + CIPHER_CHUNK_BYTES, file.size)).arrayBuffer(),
    );
    const sealed = await encryptChunk(key, meta.ivBaseHex, chunkIndex, plain);

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "x-upload-offset": String(offset),
      // Sent with every chunk so the server can reject key-material drift.
      "x-upload-iv-base": meta.ivBaseHex,
    };
    if (offset === 0) {
      headers["x-upload-total-bytes"] = String(totalCipherBytes);
      headers["x-upload-chunk-bytes"] = String(sealedChunkBytes);
    }
    const response = await fetch(`/api/assets/${assetId}/ciphertext`, {
      method: "PUT",
      headers,
      body: sealed as unknown as BodyInit,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `chunk upload failed (${response.status})`);
    }

    offset += sealed.byteLength;
    chunkIndex += 1;
    onProgress(offset, totalCipherBytes);
  }
}
