/**
 * Where server-held media bytes live: ciphertext chunks from the resumable
 * upload and degraded public previews. Two backends:
 *
 *  - `fs` — the local media dir. Default in development and scripts.
 *  - `blob` — Vercel Blob, selected automatically when a
 *    `BLOB_READ_WRITE_TOKEN` is present (Vercel functions have an ephemeral
 *    filesystem, so anything written to disk there vanishes between
 *    invocations).
 *
 * Postgres offsets remain the single source of truth for the resumable
 * upload; the store only has to write a chunk at an exact offset and read the
 * whole ciphertext back. The blob backend keeps one object per chunk
 * (`ciphertext/<assetId>/<offset16>.part`) because blobs cannot be appended
 * to; chunk offsets are deterministic (fixed chunk size), so a retried or
 * healed chunk simply overwrites its own part.
 *
 * Ciphertext and previews only — plaintext originals and keys never reach the
 * server, so they can never reach this module.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { del, get, list, put } from "@vercel/blob";

import { MEDIA_DIR } from "../../../config/env";

export interface MediaStore {
  /** Writes a ciphertext chunk at an exact byte offset (overwrites on retry). */
  writeCiphertextChunk(assetId: string, offset: number, chunk: Uint8Array): Promise<void>;
  /** Bytes present at or after `offset` must be discarded (crash healing). */
  truncateCiphertext(assetId: string, offset: number): Promise<void>;
  /** Reads the full ciphertext back for registration (stage 3a upload). */
  readCiphertext(assetId: string, expectedBytes: number): Promise<Uint8Array>;
  writePreview(assetId: string, bytes: Uint8Array): Promise<void>;
  readPreview(assetId: string): Promise<Uint8Array | null>;
}

/* ------------------------------------------------------------------ fs -- */

function ciphertextPath(assetId: string): string {
  return path.join(MEDIA_DIR(), "ciphertext", `${assetId}.bin`);
}

function previewPath(assetId: string): string {
  return path.join(MEDIA_DIR(), "previews", `${assetId}.jpg`);
}

export class FsMediaStore implements MediaStore {
  async writeCiphertextChunk(assetId: string, offset: number, chunk: Uint8Array): Promise<void> {
    const filePath = ciphertextPath(assetId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const handle = await fs.open(filePath, "r+").catch(() => fs.open(filePath, "w+"));
    try {
      const stat = await handle.stat();
      if (stat.size < offset) throw new Error("ciphertext storage out of sync");
      await handle.write(chunk, 0, chunk.byteLength, offset);
    } finally {
      await handle.close();
    }
  }

  async truncateCiphertext(assetId: string, offset: number): Promise<void> {
    const filePath = ciphertextPath(assetId);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.size > offset) await fs.truncate(filePath, offset);
  }

  async readCiphertext(assetId: string, expectedBytes: number): Promise<Uint8Array> {
    const bytes = new Uint8Array(await fs.readFile(ciphertextPath(assetId)));
    if (bytes.byteLength !== expectedBytes) {
      throw new Error(
        `ciphertext incomplete: have ${bytes.byteLength} bytes, expected ${expectedBytes}`,
      );
    }
    return bytes;
  }

  async writePreview(assetId: string, bytes: Uint8Array): Promise<void> {
    const filePath = previewPath(assetId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
  }

  async readPreview(assetId: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(previewPath(assetId)));
    } catch {
      return null;
    }
  }
}

/* ---------------------------------------------------------------- blob -- */

/** Fixed-width offsets so lexicographic blob listing equals numeric order. */
function partKey(assetId: string, offset: number): string {
  return `wtr/ciphertext/${assetId}/${offset.toString(16).padStart(16, "0")}.part`;
}

function previewKey(assetId: string): string {
  return `wtr/previews/${assetId}.jpg`;
}

async function bufferBlob(pathname: string): Promise<Uint8Array | null> {
  // useCache:false — a crash-healed chunk overwrites its part, and a stale
  // CDN copy of the old bytes would corrupt the reconstructed ciphertext.
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.stream === null) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

class BlobMediaStore implements MediaStore {
  async writeCiphertextChunk(assetId: string, offset: number, chunk: Uint8Array): Promise<void> {
    // Private: ciphertext is never served by URL — the store is only
    // readable through this module with the read-write token.
    await put(partKey(assetId, offset), Buffer.from(chunk), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/octet-stream",
    });
  }

  async truncateCiphertext(assetId: string, offset: number): Promise<void> {
    const stale = (await this.listParts(assetId)).filter((part) => part.offset >= offset);
    if (stale.length > 0) await del(stale.map((part) => part.url));
  }

  async readCiphertext(assetId: string, expectedBytes: number): Promise<Uint8Array> {
    const parts = await this.listParts(assetId);
    const out = new Uint8Array(expectedBytes);
    let position = 0;
    for (const part of parts) {
      if (part.offset !== position) {
        throw new Error(`ciphertext incomplete: gap at byte ${position}`);
      }
      const bytes = await bufferBlob(part.pathname);
      if (!bytes) throw new Error(`ciphertext part missing at byte ${position}`);
      if (position + bytes.byteLength > expectedBytes) {
        throw new Error("ciphertext longer than declared total");
      }
      out.set(bytes, position);
      position += bytes.byteLength;
    }
    if (position !== expectedBytes) {
      throw new Error(`ciphertext incomplete: have ${position} bytes, expected ${expectedBytes}`);
    }
    return out;
  }

  async writePreview(assetId: string, bytes: Uint8Array): Promise<void> {
    // Previews are only exposed through WTR's own authenticated preview
    // route, so the blobs stay private like everything else in the store.
    await put(previewKey(assetId), Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
  }

  async readPreview(assetId: string): Promise<Uint8Array | null> {
    return bufferBlob(previewKey(assetId)).catch(() => null);
  }

  private async listParts(assetId: string): Promise<{ offset: number; pathname: string; url: string }[]> {
    const parts: { offset: number; pathname: string; url: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `wtr/ciphertext/${assetId}/`, cursor });
      for (const blob of page.blobs) {
        const match = /\/([0-9a-f]{16})\.part$/.exec(blob.pathname);
        if (match) parts.push({ offset: parseInt(match[1], 16), pathname: blob.pathname, url: blob.url });
      }
      cursor = page.cursor;
    } while (cursor);
    return parts.sort((a, b) => a.offset - b.offset);
  }
}

/* ------------------------------------------------------------- factory -- */

export function mediaStoreBackend(): "blob" | "fs" {
  const forced = process.env.WTR_MEDIA_STORE;
  if (forced === "blob" || forced === "fs") return forced;
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "fs";
}

let store: MediaStore | null = null;

export function mediaStore(): MediaStore {
  store ??= mediaStoreBackend() === "blob" ? new BlobMediaStore() : new FsMediaStore();
  return store;
}
