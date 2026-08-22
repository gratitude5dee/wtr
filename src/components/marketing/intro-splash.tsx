"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { WaterIntroBackground } from "@/components/marketing/water-intro-background";
import styles from "./intro-splash.module.css";

interface IntroSplashProps {
  onComplete: () => void;
}

const chapters = [
  {
    number: "I",
    label: "Submit",
    title: "The trace is the artifact.",
    body: "Send the full record of how an agent worked: its prompts, tools, decisions, outputs, and the context that shaped the run.",
  },
  {
    number: "II",
    label: "Verify",
    title: "Human judgment makes it useful.",
    body: "Reviewers validate outcomes, label the moments that matter, and turn raw execution histories into trusted training signal.",
  },
  {
    number: "III",
    label: "License",
    title: "Consent travels with the data.",
    body: "Every contribution carries provenance and explicit terms, giving labs data they can use and people a stake in the value it creates.",
  },
];

export function IntroSplash({ onComplete }: IntroSplashProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef(false);

  const complete = useCallback(() => {
    if (completionRef.current) return;
    completionRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const steps = Array.from(
      root.querySelectorAll<HTMLElement>("[data-intro-step]"),
    );
    let frame = 0;

    const update = () => {
      frame = 0;
      const available = Math.max(root.scrollHeight - root.clientHeight, 1);
      const progress = Math.min(Math.max(root.scrollTop / available, 0), 1);
      const viewportCenter = root.scrollTop + root.clientHeight / 2;

      root.style.setProperty("--intro-progress", String(progress));

      let activeStep = steps[0];
      let activeDistance = Number.POSITIVE_INFINITY;
      for (const step of steps) {
        const stepCenter = step.offsetTop + step.offsetHeight / 2;
        const distance = Math.abs(viewportCenter - stepCenter);
        if (distance < activeDistance) {
          activeDistance = distance;
          activeStep = step;
        }
      }

      for (const step of steps) {
        step.dataset.active = String(step === activeStep);
      }

      if (progress >= 0.998 && root.scrollTop > 0) complete();
    };

    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(root);
    for (const step of steps) observer.observe(step);
    root.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();

    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", scheduleUpdate);
      observer.disconnect();
    };
  }, [complete]);

  return (
    <div ref={rootRef} className={styles.root} aria-label="Introduction to WTR">
      <div className={styles.scene} aria-hidden="true">
        <WaterIntroBackground scrollRootRef={rootRef} />
        <div className={styles.sceneWash} />
        <div className={styles.orbitLarge} />
        <div className={styles.orbitSmall} />
        <div className={styles.grain} />
      </div>

      <div className={styles.chrome} aria-hidden="true">
        <div className={styles.brand}>
          WTR<span>.</span>
        </div>
        <div className={styles.chapterRail}>
          <span>INTRODUCTION</span>
          <div className={styles.progressTrack}>
            <div className={styles.progress} />
          </div>
          <span>04</span>
        </div>
      </div>

      <div className={styles.story}>
        <section
          className={`${styles.panel} ${styles.splash}`}
          data-intro-step
          data-active="true"
        >
          <div className={styles.splashCopy}>
            <p className={styles.overline}>THE WTR PLATFORM</p>
            <h1>
              Agent traces,
              <br />
              <em>human-verified.</em>
            </h1>
            <p className={styles.subtitle}>
              Submit the work agents do and the human judgment that makes it
              trustworthy.
            </p>
          </div>
          <div className={styles.scrollCue}>
            <ArrowDown aria-hidden="true" />
            <span>Scroll to follow the data</span>
          </div>
        </section>

        {chapters.map((chapter) => (
          <section
            key={chapter.number}
            className={`${styles.panel} ${styles.chapter}`}
            data-intro-step
            data-active="false"
          >
            <div className={styles.chapterNumber}>{chapter.number}</div>
            <div className={styles.chapterCopy}>
              <p className={styles.chapterLabel}>{chapter.label}</p>
              <h2>{chapter.title}</h2>
              <p>{chapter.body}</p>
            </div>
            <div className={styles.chapterDatum}>
              <span>WTR / {chapter.number}</span>
              <span>LICENSED HUMAN DATA</span>
            </div>
          </section>
        ))}

        <section
          className={`${styles.panel} ${styles.finale}`}
          data-intro-step
          data-active="false"
        >
          <div className={styles.finaleCopy}>
            <p className={styles.overline}>THE EXCHANGE STARTS HERE</p>
            <h2>
              Make intelligence
              <br />
              accountable to
              <br />
              <em>its sources.</em>
            </h2>
            <button type="button" onClick={complete} className={styles.enter}>
              Enter WTR
              <ArrowUpRight aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
