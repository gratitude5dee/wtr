/** Supported formats per modality (goal.md P0-2). Extension decides. */

export type Modality = "audio" | "video" | "image" | "threed" | "motion" | "agenttrace";

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
  // Agent-trace exports (Hermes, OpenClaw, Codex, Claude Code). `.jsonl` is
  // unambiguous; `.json` is resolved below because Lottie claims it too.
  jsonl: "agenttrace",
};

export function modalityForFilename(filename: string): Modality | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "json") {
    // A Lottie animation keeps the historical mapping; every other .json is
    // read as an agent-trace export, which `parseTrace` then validates.
    return filename.toLowerCase().includes("lottie") ? "motion" : "agenttrace";
  }
  return EXTENSION_MODALITY[extension] ?? null;
}

export const ACCEPT_ATTRIBUTE = Object.keys(EXTENSION_MODALITY)
  .map((extension) => `.${extension}`)
  .concat(".json")
  .join(",");
