/**
 * Browser-side tier-1 measurement. Only the plaintext can answer duration
 * and pixel dimensions, and the plaintext never leaves the device — so the
 * numbers are measured here and only the numbers are sent.
 */
import type { Modality } from "./modality";

export interface Measured {
  duration_s?: number;
  width?: number;
  height?: number;
}

function measureImage(file: File): Promise<Measured> {
  return createImageBitmap(file).then((bitmap) => {
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  });
}

function measureMediaElement(file: File, kind: "audio" | "video"): Promise<Measured> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(kind);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const result: Measured = {};
      if (Number.isFinite(element.duration)) result.duration_s = element.duration;
      if (kind === "video") {
        const video = element as HTMLVideoElement;
        if (video.videoWidth > 0) result.width = video.videoWidth;
        if (video.videoHeight > 0) result.height = video.videoHeight;
      }
      cleanup();
      resolve(result);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error("could not read media metadata"));
    };
    element.src = url;
  });
}

/** Returns null when the modality has nothing measurable in a browser. */
export async function measureFile(file: File, modality: Modality): Promise<Measured | null> {
  try {
    if (modality === "image") return await measureImage(file);
    if (modality === "audio") return await measureMediaElement(file, "audio");
    if (modality === "video") return await measureMediaElement(file, "video");
    return null; // 3D and motion need format-specific parsers — a later tier.
  } catch {
    return null;
  }
}

/** Best-effort: a failed measurement must never fail the upload. */
export async function submitMeasurements(assetId: string, measured: Measured): Promise<void> {
  const entries = Object.entries(measured).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  await fetch(`/api/assets/${assetId}/labels/measured`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(entries)),
  }).catch(() => undefined);
}
