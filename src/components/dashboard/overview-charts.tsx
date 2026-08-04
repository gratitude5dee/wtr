"use client";

import { Area } from "@/components/dither-kit/area";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";

export interface EarningsChartRow {
  month: string;
  /** Whole-token amounts for display only — wei never reaches the client. */
  catalog: number;
  requests: number;
}

const EARNINGS_CONFIG = {
  catalog: { label: "Catalog sales", color: "blue" },
  requests: { label: "Lab requests", color: "purple" },
} as const;

export function EarningsChart({ data }: { data: EarningsChartRow[] }) {
  return (
    <AreaChart data={data} config={EARNINGS_CONFIG} bloom="aura">
      <XAxis dataKey="month" />
      <YAxis />
      <Legend isClickable />
      <Tooltip labelKey="month" />
      <Area dataKey="catalog" variant="gradient" />
      <Area dataKey="requests" variant="hatched" />
    </AreaChart>
  );
}

export interface FunnelChartRow {
  stage: string;
  count: number;
}

const FUNNEL_CONFIG = {
  count: { label: "Assets", color: "blue" },
} as const;

export function PipelineFunnelChart({ data }: { data: FunnelChartRow[] }) {
  return (
    <BarChart data={data} config={FUNNEL_CONFIG}>
      <XAxis dataKey="stage" />
      <YAxis />
      <Tooltip labelKey="stage" />
      <Bar dataKey="count" />
    </BarChart>
  );
}
