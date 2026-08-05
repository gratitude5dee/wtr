/**
 * Degraded public preview, generated in the browser (goal.md P0-2). The
 * decode → canvas → re-encode round trip keeps only pixels: EXIF/XMP GPS and
 * device metadata never survive it, and the output is far too small to be
 * usable as training data.
 */

import { withBasePath } from "../base-path";

const MAX_EDGE = 512;
const JPEG_QUALITY = 0.5;

export async function makeImagePreview(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // Not decodable in this browser (e.g. some SVGs) — no preview.
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
  } finally {
    bitmap.close();
  }
}

export async function uploadPreview(assetId: string, preview: Blob): Promise<void> {
  const response = await fetch(withBasePath(`/api/assets/${assetId}/preview`), {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: preview,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `preview upload failed (${response.status})`);
  }
}
