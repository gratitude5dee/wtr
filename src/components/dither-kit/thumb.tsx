"use client"

import { useEffect, useRef } from "react"
import { cn } from "./lib"
import { type DitherColor, PALETTE, rgb } from "./palette"
import { BAYER4, fnv1a, pixelPrefersReducedMotion, xorshift32 } from "./pixel"
import type { ThumbVariant } from "./thumb-style"

export type DitherThumbProps = {
  /** Deterministic seed — same seed, same picture, every time. */
  seed: string
  color?: DitherColor
  /** Omit to derive from the seed: audio→wave, otherwise texture. */
  variant?: ThumbVariant
  className?: string
}

const W = 96
const H = 54

function paintWave(
  ctx: CanvasRenderingContext2D,
  seed: string,
  fill: [number, number, number],
  progress: number
) {
  const rand = xorshift32(fnv1a(seed))
  const mid = H / 2
  const cols = Math.floor(W * progress)
  let amp = 0.25 + rand() * 0.4
  for (let x = 0; x < cols; x++) {
    if (rand() < 0.08) amp = 0.15 + rand() * 0.7
    const h = Math.max(1, Math.round(mid * amp * (0.4 + rand() * 0.6)))
    for (let y = mid - h; y < mid + h; y++) {
      const density = 1 - Math.abs(y - mid) / (mid || 1)
      const lit = density > BAYER4[y & 3][x & 3] - 0.15
      ctx.fillStyle = rgb(fill, 1, lit ? 0.85 : 0.28)
      ctx.fillRect(x, y, 1, 1)
    }
  }
}

function paintTexture(
  ctx: CanvasRenderingContext2D,
  seed: string,
  fill: [number, number, number],
  hatched: boolean,
  progress: number
) {
  const rand = xorshift32(fnv1a(seed))
  // A ridge line wanders across the tile; everything under it is dithered in.
  let top = H * (0.25 + rand() * 0.35)
  const cols = Math.floor(W * progress)
  for (let x = 0; x < cols; x++) {
    top += (rand() - 0.5) * 3
    if (top < 4) top = 4
    if (top > H - 8) top = H - 8
    const t = Math.round(top)
    for (let y = t; y < H; y++) {
      if (hatched && ((x + y) & 3) >= 2) continue
      const density = (y - t) / (H - t)
      const lit = density > BAYER4[y & 3][x & 3] - 0.1
      const alpha = (0.3 + density * 0.7) * (lit ? 1 : 0.4)
      ctx.fillStyle = rgb(fill, 1, alpha)
      ctx.fillRect(x, y, 1, 1)
    }
    ctx.fillStyle = rgb(fill, 1, 0.72)
    ctx.fillRect(x, t, 1, 1)
  }
}

/**
 * Deterministic dithered preview tile — a waveform for audio, an ordered-dither
 * texture for everything else, drawn from the same Bayer matrix as the charts.
 */
export function DitherThumb({
  seed,
  color = "blue",
  variant = "texture",
  className,
}: DitherThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const fill = PALETTE[color].fill

    const draw = (progress: number) => {
      ctx.clearRect(0, 0, W, H)
      if (variant === "wave") paintWave(ctx, seed, fill, progress)
      else paintTexture(ctx, seed, fill, variant === "hatched", progress)
    }

    if (pixelPrefersReducedMotion()) {
      draw(1)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 500)
      draw(1 - (1 - t) ** 3)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seed, color, variant])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("h-full w-full", className)}
      style={{ imageRendering: "pixelated" }}
    />
  )
}
