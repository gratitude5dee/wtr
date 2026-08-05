import Link from "next/link";

import {
  EarningsChart,
  PipelineFunnelChart,
} from "@/components/dashboard/overview-charts";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventLabel, formatIp, STAGE_LABEL, STAGE_TINT } from "@/lib/dashboard/format";
import {
  getCurrentCreator,
  getEarningsByMonth,
  getOverviewStats,
  getPipelineFunnel,
  listRecentActivity,
} from "@/lib/dashboard/queries";
import { formatWei } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const creator = await getCurrentCreator();
  if (!creator) {
    return (
      <div className="mx-auto max-w-lg pt-24 text-center">
        <h1 className="mb-2 text-xl font-semibold">Welcome to WTR</h1>
        <p className="text-sm text-muted-foreground">
          No creator account exists yet.{" "}
          <Link className="underline" href="/onboarding">
            Set up your identity and accept the terms
          </Link>
          , then upload your first file.
        </p>
      </div>
    );
  }

  const [stats, funnel, earnings, activity] = await Promise.all([
    getOverviewStats(creator.id),
    getPipelineFunnel(creator.id),
    getEarningsByMonth(creator.id),
    listRecentActivity(creator.id),
  ]);

  // Render boundary: wei → whole-token numbers, for the charts only.
  const earningsRows = earnings.map((point) => ({
    month: point.month,
    catalog: Number(formatWei(point.catalogWei)),
    requests: Number(formatWei(point.requestsWei)),
  }));
  const monthlyTotals = earningsRows.map((row) => row.catalog + row.requests);
  const funnelRows = funnel.map((row) => ({
    stage: STAGE_LABEL[row.stage] ?? row.stage,
    count: row.count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Creator"
        title="Where everything stands"
        description="Your work, its pipeline, and what it has earned."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link href="/upload?tour=creator">Creator/Distributor walkthrough</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/requests?tour=buyer">Data Buyer walkthrough</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/upload">Upload</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Listed"
          value={String(stats.listed)}
          unit="assets"
          note="live in the catalog"
          color="green"
          spark={funnel.map((row) => row.count)}
        />
        <StatCard
          label="In pipeline"
          value={String(stats.pipeline)}
          unit="assets"
          note="tray → registration"
          color="blue"
          spark={funnel.map((row) => row.count).reverse()}
        />
        <StatCard
          label="Gross"
          value={formatWei(stats.grossWei)}
          unit="IP"
          note="all-time sales"
          color="purple"
          spark={monthlyTotals}
        />
        <StatCard
          label="Claimable"
          value={formatWei(stats.claimableWei)}
          unit="IP"
          note="earned, not yet paid out"
          color="orange"
          spark={monthlyTotals}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Earnings over time</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {earningsRows.length > 0 ? (
              <EarningsChart data={earningsRows} />
            ) : (
              <p className="pt-16 text-center text-sm text-muted-foreground">
                No sales yet. Earnings appear here after your first license mint.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-40">
              {funnel.some((row) => row.count > 0) ? (
                <PipelineFunnelChart data={funnelRows} />
              ) : (
                <p className="pt-12 text-center text-sm text-muted-foreground">
                  Nothing in the pipeline.{" "}
                  <Link className="underline" href="/upload">
                    Upload a file
                  </Link>{" "}
                  to get started.
                </p>
              )}
            </div>
            <ul className="space-y-1.5">
              {funnel.map((row) => (
                <li
                  key={row.stage}
                  className="flex items-center justify-between text-xs"
                >
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono uppercase tracking-wider ${STAGE_TINT[row.stage] ?? ""}`}
                  >
                    {STAGE_LABEL[row.stage] ?? row.stage}
                  </span>
                  <span className="font-mono text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((item, index) => (
                <li
                  key={index}
                  className="flex items-baseline justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate">
                    <Link
                      className="font-medium underline-offset-2 hover:underline"
                      href={`/assets/${item.assetId}`}
                    >
                      {item.filename ?? item.assetId.slice(0, 8)}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      — {eventLabel(item.eventType)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {item.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Total earned across all channels:{" "}
        <span className="font-mono text-foreground">{formatIp(stats.grossWei)}</span>
      </p>
    </div>
  );
}
