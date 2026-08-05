"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface Step {
  /** `data-tour` value of the element the step points at, when on this page. */
  anchor: string;
  title: string;
  body: string;
  /** Route the step lives on; the tour navigates there when it starts. */
  href: string;
}

const TOURS: Record<string, { label: string; steps: Step[] }> = {
  creator: {
    label: "Creator / distributor",
    steps: [
      {
        anchor: "nav-upload",
        title: "Upload",
        body: "One file at a time: hashed and encrypted in your browser before anything leaves the device.",
        href: "/upload",
      },
      {
        anchor: "bulk-upload",
        title: "Bulk upload",
        body: "Drop a whole roster's worth of files and attach a CSV or JSON manifest so each one lands with its labels, license and price.",
        href: "/upload/bulk",
      },
      {
        anchor: "assets-bulk-actions",
        title: "Bulk actions",
        body: "Already-registered work: batch-apply labels and a license choice across everything you manage.",
        href: "/assets",
      },
      {
        anchor: "assets-list",
        title: "Assets",
        body: "Every file you have added, from tray to settlement.",
        href: "/assets",
      },
      {
        anchor: "payouts",
        title: "Payouts",
        body: "What has been paid, what is pending, and which rail it settles on.",
        href: "/payouts",
      },
    ],
  },
  buyer: {
    label: "Data buyer",
    steps: [
      {
        anchor: "requests-list",
        title: "Open briefs",
        body: "Every lab request, with its funding state, deadline and data shape.",
        href: "/requests",
      },
      {
        anchor: "requests-new",
        title: "Post a request",
        body: "Verified labs post their own brief here.",
        href: "/requests",
      },
      {
        anchor: "request-funding",
        title: "Funding",
        body: "Post unfunded, put down a 10% deposit, or pay the whole budget up front.",
        href: "/requests/new",
      },
      {
        anchor: "request-data-shape",
        title: "Data shape",
        body: "Describe the object you want back, field by field.",
        href: "/requests/new",
      },
      {
        anchor: "request-deadline",
        title: "Deadline",
        body: "Your local time, stored as a UTC instant — submissions stop when it passes.",
        href: "/requests/new",
      },
      {
        anchor: "request-instructions",
        title: "Special instructions",
        body: "Anything a creator must do differently: delivery format, naming, quality bar.",
        href: "/requests/new",
      },
    ],
  },
};

/**
 * A dependency-free guided tour. Steps are anchored to `data-tour` attributes;
 * the overlay follows the element when it exists on the current page and falls
 * back to a centred card when it does not.
 */
export function Walkthrough() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tour = searchParams.get("tour");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const definition = tour ? TOURS[tour] : undefined;
  const step = definition?.steps[index];

  useEffect(() => {
    setIndex(0);
  }, [tour]);

  useEffect(() => {
    if (!step) return;
    let timer = 0;
    let found: Element | null = null;
    let attempts = 0;
    const track = () => {
      if (found) setRect(found.getBoundingClientRect());
    };
    // The anchor may not exist yet (navigation in flight), so poll until it
    // appears — then stop, scroll to it once, and only follow it on scroll or
    // resize. Polling forever would drag the reader back every tick.
    const locate = () => {
      found = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (found) {
        setRect(found.getBoundingClientRect());
        found.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      setRect(null);
      attempts += 1;
      if (attempts < 15) timer = window.setTimeout(locate, 200);
    };
    locate();
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", track, true);
      window.removeEventListener("resize", track);
    };
  }, [step, pathname]);

  const go = useCallback(
    (next: number) => {
      const target = definition?.steps[next];
      if (!definition || !target || !tour) return;
      setIndex(next);
      if (target.href !== pathname) router.push(`${target.href}?tour=${tour}`);
    },
    [definition, pathname, router, tour],
  );

  const end = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tour");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  if (!definition || !step) return null;

  const last = index === definition.steps.length - 1;
  const cardStyle =
    rect === null
      ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
      : {
          top: Math.min(rect.bottom + 12, window.innerHeight - 200),
          left: Math.min(Math.max(rect.left, 16), window.innerWidth - 360),
        };

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-background/60" />
      {rect && (
        <div
          className="absolute rounded-lg border-2 border-[rgb(var(--tint-blue))] transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        className="pointer-events-auto absolute w-[340px] rounded-xl border bg-card p-4 shadow-lg"
        style={cardStyle}
        role="dialog"
        aria-label={`${definition.label} walkthrough`}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {definition.label} · {index + 1}/{definition.steps.length}
        </div>
        <div className="mt-1 text-sm font-semibold">{step.title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={end}>
            Skip
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              Back
            </Button>
            <Button size="sm" onClick={() => (last ? end() : go(index + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
