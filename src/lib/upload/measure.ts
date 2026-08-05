/**
 * Browser-side tier-1 measurement. Only the plaintext can answer duration
 * and pixel dimensions, and the plaintext never leaves the device — so the
 * numbers are measured here and only the numbers are sent.
 */
import { ahash64, dhash64, phash64 } from "../labels/perceptual-hash";
import { withBasePath } from "../base-path";
import type { Modality } from "./modality";

export interface Measured {
  duration_s?: number;
  width?: number;
  height?: number;
  ahash64?: string;
  dhash64?: string;
  phash64?: string;
}

type Drawable = ImageBitmap | HTMLVideoElement;

/** Downscales to w×h and returns row-major grayscale (0–255). */
function grayscale(source: Drawable, w: number, h: number): number[] | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray: number[] = [];
  for (let i = 0; i < w * h; i += 1) {
    gray.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  return gray;
}

/** Perceptual fingerprints of one frame (goal.md P0-3 file.hashes). */
function hashFrame(source: Drawable): Partial<Measured> {
  const g8 = grayscale(source, 8, 8);
  const g9 = grayscale(source, 9, 8);
  const g32 = grayscale(source, 32, 32);
  if (!g8 || !g9 || !g32) return {};
  return { ahash64: ahash64(g8), dhash64: dhash64(g9), phash64: phash64(g32) };
}

function measureImage(file: File): Promise<Measured> {
  return createImageBitmap(file).then((bitmap) => {
    const result: Measured = { width: bitmap.width, height: bitmap.height, ...hashFrame(bitmap) };
    bitmap.close();
    return result;
  });
}

/** First-frame perceptual hashes for video, once metadata is loaded. */
function hashVideoFrame(video: HTMLVideoElement): Promise<Partial<Measured>> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      // Only hash once a frame is actually decodable — drawing an element at
      // readyState < 2 paints a blank canvas, and identical blank-frame
      // fingerprints would cause bogus similarity matches.
      const ready = video.readyState >= 2 && video.videoWidth > 0;
      resolve(ready ? hashFrame(video) : {});
    };
    if (video.readyState >= 2) return done();
    // A same-position seek can be a no-op in some browsers (no `seeked`), so
    // also wait for the first decodable frame and cap the whole attempt —
    // hashes are best-effort and must never wedge the measurement promise.
    video.onseeked = done;
    video.onloadeddata = done;
    video.oncanplay = done;
    video.onerror = () => {
      if (!settled) {
        settled = true;
        resolve({});
      }
    };
    setTimeout(done, 3000);
    try {
      video.currentTime = 0;
    } catch {
      done();
    }
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
    element.preload = kind === "video" ? "auto" : "metadata";
    element.onloadedmetadata = () => {
      const result: Measured = {};
      if (Number.isFinite(element.duration)) result.duration_s = element.duration;
      if (kind === "video") {
        const video = element as HTMLVideoElement;
        if (video.videoWidth > 0) result.width = video.videoWidth;
        if (video.videoHeight > 0) result.height = video.videoHeight;
        void hashVideoFrame(video).then((hashes) => {
          cleanup();
          resolve({ ...result, ...hashes });
        });
        return;
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
  await fetch(withBasePath(`/api/assets/${assetId}/labels/measured`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(entries)),
  }).catch(() => undefined);
}
