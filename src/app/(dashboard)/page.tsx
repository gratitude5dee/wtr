import Link from "next/link";

import {
  EarningsChart,
  PipelineFunnelChart,
} from "@/components/dashboard/overview-charts";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventLabel, formatIp, STAGE_LABEL } from "@/lib/dashboard/format";
import {
  getCurrentCreator,
  getEarningsByMonth,
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

  const [funnel, earnings, activity] = await Promise.all([
    getPipelineFunnel(creator.id),
    getEarningsByMonth(creator.id),
    listRecentActivity(creator.id),
  ]);

  // Render boundary: wei → whole-token numbers, for the chart only.
  const earningsRows = earnings.map((point) => ({
    month: point.month,
    catalog: Number(formatWei(point.catalogWei)),
    requests: Number(formatWei(point.requestsWei)),
  }));
  const totalWei = earnings.reduce(
    (sum, point) => sum + point.catalogWei + point.requestsWei,
    0n,
  );
  const funnelRows = funnel.map((row) => ({
    stage: STAGE_LABEL[row.stage] ?? row.stage,
    count: row.count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Creator"
        title="Overview"
        actions={
          <div className="text-sm text-muted-foreground">
            Total earned:{" "}
            <span className="font-mono text-foreground">{formatIp(totalWei)}</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
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
          <CardContent className="h-64">
            {funnel.some((row) => row.count > 0) ? (
              <PipelineFunnelChart data={funnelRows} />
            ) : (
              <p className="pt-16 text-center text-sm text-muted-foreground">
                Nothing in the pipeline.{" "}
                <Link className="underline" href="/upload">
                  Upload a file
                </Link>{" "}
                to get started.
              </p>
            )}
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
            <ul className="space-y-2">
              {activity.map((item, index) => (
                <li key={index} className="flex items-baseline justify-between text-sm">
                  <span>
                    <Link className="font-medium underline-offset-2 hover:underline" href={`/assets/${item.assetId}`}>
                      {item.filename ?? item.assetId.slice(0, 8)}
                    </Link>{" "}
                    — {eventLabel(item.eventType)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
