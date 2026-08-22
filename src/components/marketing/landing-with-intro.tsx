"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { IntroSplash } from "@/components/marketing/intro-splash";

const STORAGE_KEY = "wtr:intro-seen";

type IntroState = "checking" | "visible" | "dismissed";

export function LandingWithIntro({ children }: { children: ReactNode }) {
  const [introState, setIntroState] = useState<IntroState>("checking");

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const resolveState = () => {
      let hasSeenIntro = false;
      try {
        hasSeenIntro = window.sessionStorage.getItem(STORAGE_KEY) === "true";
      } catch {
        hasSeenIntro = false;
      }

      setIntroState(
        motionPreference.matches || hasSeenIntro ? "dismissed" : "visible",
      );
    };

    const handleMotionChange = () => {
      if (motionPreference.matches) setIntroState("dismissed");
    };

    resolveState();
    motionPreference.addEventListener("change", handleMotionChange);
    return () =>
      motionPreference.removeEventListener("change", handleMotionChange);
  }, []);

  const dismissIntro = useCallback(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Session storage can be unavailable in hardened browsing contexts.
    }
    setIntroState("dismissed");
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const landingVisible = introState === "dismissed";

  return (
    <>
      <div
        aria-hidden={!landingVisible}
        className={
          landingVisible
            ? "relative"
            : "pointer-events-none invisible h-0 overflow-hidden"
        }
      >
        {children}
      </div>
      {introState === "checking" && (
        <div
          className="fixed inset-0 z-[100] bg-[#050809]"
          aria-hidden="true"
        />
      )}
      {introState === "visible" && <IntroSplash onComplete={dismissIntro} />}
    </>
  );
}
