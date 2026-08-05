import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const monoLabel =
  "font-mono text-[10px] uppercase tracking-[0.16em]";

export function SectionKicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(monoLabel, "text-[#a3a3a3]", className)}>
      {children}
    </div>
  );
}

const signalClasses = {
  blue: "bg-[rgb(var(--tint-blue))]",
  green: "bg-[rgb(var(--tint-green))]",
  orange: "bg-[rgb(var(--tint-orange))]",
  purple: "bg-[rgb(var(--tint-purple))]",
} as const;

export function Signal({
  color = "blue",
}: {
  color?: keyof typeof signalClasses;
}) {
  return (
    <span
      className={cn("inline-block size-1.5 rounded-full", signalClasses[color])}
    />
  );
}
