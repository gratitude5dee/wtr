"use client";

import { Area } from "@/components/dither-kit/area";
import { AreaChart } from "@/components/dither-kit/area-chart";
import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Sparkline } from "@/components/dither-kit/sparkline";
import { XAxis } from "@/components/dither-kit/x-axis";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionKicker, monoLabel } from "@/components/marketing/section";
import { cn } from "@/lib/utils";

interface MetricCard {
  title: string;
  value: string;
  color: "green" | "purple" | "blue";
  data: number[];
}

interface ListedRow {
  month: string;
  assets: number;
}

interface EarningsRow {
  month: string;
  earnings: number;
}

const metricCards: MetricCard[] = [
  {
    title: "ASSETS LISTED OVER TIME",
    value: "1,284",
    color: "green",
    data: [5, 8, 7, 13, 17, 16, 24, 29, 35],
  },
  {
    title: "EARNINGS BY MONTH",
    value: "18,420 IP",
    color: "purple",
    data: [5, 11, 9, 18, 14, 22, 29, 27, 38],
  },
  {
    title: "REQUESTS FUNDED",
    value: "64",
    color: "blue",
    data: [3, 5, 5, 8, 11, 10, 15, 19, 22],
  },
];

const listedData: ListedRow[] = [
  { month: "JAN", assets: 8 },
  { month: "FEB", assets: 14 },
  { month: "MAR", assets: 19 },
  { month: "APR", assets: 27 },
  { month: "MAY", assets: 35 },
];

const earningsData: EarningsRow[] = [
  { month: "JAN", earnings: 5 },
  { month: "FEB", earnings: 11 },
  { month: "MAR", earnings: 9 },
  { month: "APR", earnings: 18 },
  { month: "MAY", earnings: 24 },
];

export function Metrics() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionKicker>06 / PROOF OF MOTION</SectionKicker>
          <h2 className="mt-5 text-4xl tracking-[-.05em] sm:text-5xl">
            The rail gets
            <br />
            <span className="text-[#a3a3a3]">more useful over time.</span>
          </h2>
        </div>
        <Badge variant="outline" className={cn(monoLabel)}>
          Illustrative sample data
        </Badge>
      </div>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        <Card className="border-white/10 bg-[#141414]">
          <CardHeader>
              <div className={cn(monoLabel, "text-[#a3a3a3]")}>
              {metricCards[0].title}
            </div>
            <CardTitle className="mt-3 text-3xl">{metricCards[0].value}</CardTitle>
          </CardHeader>
          <CardContent className="h-28">
            <BarChart
              data={listedData}
              config={{ assets: { label: "Assets", color: "green" } }}
              interactive={false}
              bloom="low"
            >
              <XAxis dataKey="month" />
              <Bar dataKey="assets" />
            </BarChart>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-[#141414]">
          <CardHeader>
              <div className={cn(monoLabel, "text-[#a3a3a3]")}>
              {metricCards[1].title}
            </div>
            <CardTitle className="mt-3 text-3xl">{metricCards[1].value}</CardTitle>
          </CardHeader>
          <CardContent className="h-28">
            <AreaChart
              data={earningsData}
              config={{ earnings: { label: "Earnings", color: "purple" } }}
              interactive={false}
              bloom="low"
            >
              <XAxis dataKey="month" />
              <Area dataKey="earnings" variant="gradient" />
            </AreaChart>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-[#141414]">
          <CardHeader>
              <div className={cn(monoLabel, "text-[#a3a3a3]")}>
              {metricCards[2].title}
            </div>
            <CardTitle className="mt-3 text-3xl">{metricCards[2].value}</CardTitle>
          </CardHeader>
          <CardContent className="h-28">
            <Sparkline
              data={metricCards[2].data}
              color={metricCards[2].color}
              animate
              bloom="low"
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
