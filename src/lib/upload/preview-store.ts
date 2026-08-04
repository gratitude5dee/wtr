/**
 * Public previews (goal.md P0-2/P0-9): deliberately degraded, generated in
 * the browser by re-encoding onto a canvas — which inherently drops EXIF/XMP
 * GPS and device metadata, since only pixels survive the decode/re-encode.
 * The server never sees the original, so it could not leak what it never had.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { MEDIA_DIR } from "../../../config/env";
import { db } from "../db/pool";

export class PreviewError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

/** Degraded previews are small by construction; reject anything else. */
const MAX_PREVIEW_BYTES = 512 * 1024;
const PREVIEW_MIME = "image/jpeg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Asset ids come from the URL; only a UUID may ever touch the filesystem. */
function previewPath(assetId: string): string {
  if (!UUID.test(assetId)) throw new PreviewError("asset not found", 404);
  return path.join(MEDIA_DIR(), "previews", `${assetId}.jpg`);
}

export async function storePreview(
  creatorId: string,
  assetId: string,
  bytes: Uint8Array,
): Promise<string> {
  if (!UUID.test(assetId)) throw new PreviewError("asset not found", 404);
  if (bytes.byteLength === 0) throw new PreviewError("empty preview");
  if (bytes.byteLength > MAX_PREVIEW_BYTES) {
    throw new PreviewError("preview too large — it must be degraded");
  }
  // JPEG SOI marker: the canvas re-encode always produces JPEG.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new PreviewError("preview must be a JPEG");
  }

  const previewUrl = `/api/assets/${assetId}/preview`;
  const updated = await db.query(
    "UPDATE asset SET preview_url = $3 WHERE id = $1 AND creator_id = $2",
    [assetId, creatorId, previewUrl],
  );
  if (updated.rowCount === 0) throw new PreviewError("asset not found", 404);

  const filePath = previewPath(assetId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  return previewUrl;
}

export async function readPreview(
  assetId: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!UUID.test(assetId)) return null;
  const rows = await db.query<{ preview_url: string | null }>(
    "SELECT preview_url FROM asset WHERE id = $1",
    [assetId],
  );
  if (!rows.rows[0]?.preview_url) return null;
  try {
    return { bytes: await fs.readFile(previewPath(assetId)), mime: PREVIEW_MIME };
  } catch {
    return null;
  }
}
