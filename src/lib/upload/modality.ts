/** Supported formats per modality (goal.md P0-2). Extension decides. */

export type Modality = "audio" | "video" | "image" | "threed" | "motion";

const EXTENSION_MODALITY: Record<string, Modality> = {
  wav: "audio",
  mp3: "audio",
  flac: "audio",
  aiff: "audio",
  aac: "audio",
  ogg: "audio",
  opus: "audio",
  m4a: "audio",
  mp4: "video",
  webm: "video",
  mov: "video",
  jpeg: "image",
  jpg: "image",
  png: "image",
  webp: "image",
  avif: "image",
  gif: "image",
  svg: "image",
  glb: "threed",
  gltf: "threed",
  fbx: "threed",
  obj: "threed",
  usdz: "threed",
  // Motion shares containers with video; a Lottie .json is unambiguous.
  lottie: "motion",
};

export function modalityForFilename(filename: string): Modality | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "json" && filename.toLowerCase().includes("lottie")) return "motion";
  return EXTENSION_MODALITY[extension] ?? null;
}

export const ACCEPT_ATTRIBUTE = Object.keys(EXTENSION_MODALITY)
  .map((extension) => `.${extension}`)
  .concat(".json")
  .join(",");
