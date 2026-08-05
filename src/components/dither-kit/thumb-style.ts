import type { DitherColor } from "./palette"

export type ThumbVariant = "texture" | "hatched" | "wave"

/** Modality → the thumb's colour + variant, shared by assets and catalog. */
export function thumbStyleFor(modality: string): {
  color: DitherColor
  variant: ThumbVariant
} {
  switch (modality) {
    case "audio":
      return { color: "grey", variant: "wave" }
    case "video":
      return { color: "purple", variant: "texture" }
    case "motion":
      return { color: "pink", variant: "texture" }
    case "threed":
      return { color: "grey", variant: "hatched" }
    default:
      return { color: "blue", variant: "hatched" }
  }
}
