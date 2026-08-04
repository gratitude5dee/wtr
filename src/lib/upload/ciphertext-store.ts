/**
 * Server side of the resumable encrypted upload. Ciphertext is appended to a
 * per-asset file; the byte offset in Postgres is the single source of truth
 * for resume. Chunks must arrive in order at exactly the recorded offset —
 * an out-of-order chunk is rejected so the file can never silently corrupt.
 *
 * Only ciphertext ever reaches this module. Plaintext and keys stay in the
 * creator's browser.
 */
import { db } from "../db/pool";
import { mediaStore } from "../storage/media-store";

/** Bad input, safe to echo to the caller. */
export class CiphertextError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

const IV_BASE_HEX = /^[0-9a-f]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_CHUNK_BYTES = 32 * 1024 * 1024;

/** Asset ids come from the URL; only a UUID may ever touch the filesystem. */
export function assertAssetId(assetId: string): void {
  if (!UUID.test(assetId)) throw new CiphertextError("asset not found", 404);
}

export interface UploadStatus {
  totalBytes: number | null;
  received: number;
  chunkBytes: number | null;
  ivBase: string | null;
  complete: boolean;
}

export async function uploadStatus(creatorId: string, assetId: string): Promise<UploadStatus> {
  assertAssetId(assetId);
  const rows = await db.query<{
    ciphertext_total_bytes: string | null;
    ciphertext_received: string;
    ciphertext_chunk_bytes: number | null;
    ciphertext_iv_base: string | null;
    ciphertext_complete: boolean;
  }>(
    `SELECT ciphertext_total_bytes, ciphertext_received, ciphertext_chunk_bytes,
            ciphertext_iv_base, ciphertext_complete
     FROM asset WHERE id = $1 AND creator_id = $2`,
    [assetId, creatorId],
  );
  const row = rows.rows[0];
  if (!row) throw new CiphertextError("asset not found", 404);
  return {
    totalBytes: row.ciphertext_total_bytes === null ? null : Number(row.ciphertext_total_bytes),
    received: Number(row.ciphertext_received),
    chunkBytes: row.ciphertext_chunk_bytes,
    ivBase: row.ciphertext_iv_base,
    complete: row.ciphertext_complete,
  };
}

/** First chunk declares the upload's shape; later chunks must match it. */
export async function beginUpload(
  creatorId: string,
  assetId: string,
  params: { totalBytes: number; chunkBytes: number; ivBase: string },
): Promise<void> {
  if (!Number.isInteger(params.totalBytes) || params.totalBytes <= 0) {
    throw new CiphertextError("totalBytes must be a positive integer");
  }
  if (!Number.isInteger(params.chunkBytes) || params.chunkBytes <= 0) {
    throw new CiphertextError("chunkBytes must be a positive integer");
  }
  if (!IV_BASE_HEX.test(params.ivBase)) {
    throw new CiphertextError("ivBase must be 16 lowercase hex characters");
  }
  const updated = await db.query(
    `UPDATE asset
     SET ciphertext_total_bytes = $3, ciphertext_chunk_bytes = $4, ciphertext_iv_base = $5
     WHERE id = $1 AND creator_id = $2
       AND ciphertext_total_bytes IS NULL AND ciphertext_received = 0`,
    [assetId, creatorId, params.totalBytes, params.chunkBytes, params.ivBase],
  );
  if (updated.rowCount === 0) {
    // Either the asset does not exist or an upload was already begun; the
    // status endpoint disambiguates for the client.
    const status = await uploadStatus(creatorId, assetId);
    if (
      status.totalBytes !== params.totalBytes ||
      status.chunkBytes !== params.chunkBytes ||
      status.ivBase !== params.ivBase
    ) {
      throw new CiphertextError("upload already begun with different parameters", 409);
    }
  }
}

export async function appendChunk(
  creatorId: string,
  assetId: string,
  offset: number,
  chunk: Uint8Array,
  ivBase: string,
): Promise<UploadStatus> {
  if (chunk.byteLength === 0) throw new CiphertextError("empty chunk");
  if (chunk.byteLength > MAX_CHUNK_BYTES) throw new CiphertextError("chunk too large");

  const status = await uploadStatus(creatorId, assetId);
  if (status.complete) throw new CiphertextError("upload already complete", 409);
  if (status.totalBytes === null) throw new CiphertextError("upload not begun", 409);
  if (ivBase !== status.ivBase) {
    // Every chunk must be sealed under the same key material the upload was
    // begun with; a fresh key on resume would produce an unopenable file.
    throw new CiphertextError("ivBase does not match this upload — restart from offset 0", 409);
  }
  if (offset !== status.received) {
    // Resume point mismatch: the client asks GET for the true offset.
    throw new CiphertextError(`expected offset ${status.received}`, 409);
  }
  if (status.received + chunk.byteLength > status.totalBytes) {
    throw new CiphertextError("chunk overruns declared total");
  }

  // A crash between the storage write and the offset update leaves bytes
  // beyond the recorded offset. The DB offset is the source of truth, so
  // heal by discarding them and re-writing the chunk.
  const store = mediaStore();
  await store.truncateCiphertext(assetId, offset);
  try {
    await store.writeCiphertextChunk(assetId, offset, chunk);
  } catch {
    throw new CiphertextError("storage out of sync", 500);
  }

  const received = status.received + chunk.byteLength;
  const complete = received === status.totalBytes;
  await db.query(
    `UPDATE asset SET ciphertext_received = $3, ciphertext_complete = $4
     WHERE id = $1 AND creator_id = $2`,
    [assetId, creatorId, received, complete],
  );
  return { ...status, received, complete };
}
