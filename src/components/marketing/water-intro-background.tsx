"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface WaterIntroBackgroundProps {
  scrollRootRef: RefObject<HTMLDivElement | null>;
}

export function WaterIntroBackground({
  scrollRootRef,
}: WaterIntroBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = hostRef.current;
    const scrollRoot = scrollRootRef.current;
    if (!container || !scrollRoot) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;

    const initialize = async () => {
      try {
        const { createWaterIntroScene } =
          await import("./water-intro-scene.js");
        const nextDispose = await createWaterIntroScene({
          container,
          scrollRoot,
        });
        if (cancelled) {
          nextDispose();
          return;
        }
        dispose = nextDispose;
        container.dataset.renderer = "ready";
      } catch {
        container.dataset.renderer = "unavailable";
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [scrollRootRef]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
