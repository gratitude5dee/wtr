"use client";

import { useState } from "react";

import { Sparkline } from "@/components/dither-kit/sparkline";
import type { DitherColor } from "@/components/dither-kit/palette";
import { Card, CardContent } from "@/components/ui/card";

export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  color: DitherColor;
  /** Small decorative series — real read-model numbers, never synthetic. */
  spark: number[];
}

/** Overview stat card: kicker label, big number, and a dithered spark. */
export function StatCard({ label, value, unit, note, color, spark }: StatCardProps) {
  const [hovered, setHovered] = useState(false);
  const series = spark.length >= 2 ? spark : [0, 0, 0, 0];
  const hasSignal = series.some((v) => v > 0);

  return (
    <Card
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CardContent className="space-y-2 pt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {unit && (
            <span className="font-mono text-xs text-muted-foreground">{unit}</span>
          )}
        </div>
        <div className="h-8">
          <Sparkline
            data={hasSignal ? series : series.map(() => 0)}
            color={hasSignal ? color : "grey"}
            hovered={hovered}
            bloom="low"
            bloomOnHover
            animate
          />
        </div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
