import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { explorerTx, formatIp, shortHash } from "@/lib/dashboard/format";
import {
  getCurrentCreator,
  getEarningsByMonth,
  getPayoutSummary,
  listPayouts,
} from "@/lib/dashboard/queries";
import { formatWei } from "@/lib/money";

export const dynamic = "force-dynamic";

const RAIL_LABEL: Record<string, string> = {
  onchain: "On-chain",
  fiat: "Bank",
};

export default async function PayoutsPage() {
  const creator = await getCurrentCreator();
  if (!creator) {
    return (
      <div className="space-y-4">
        <PageHeader
          kicker="Creator"
          title="Payouts"
          description="What has been paid, what is still owed, and how it settles."
        />
        <p className="text-sm text-muted-foreground">
          No creator account yet — payouts appear here after your first sale.
        </p>
      </div>
    );
  }

  const [payouts, summary, earnings] = await Promise.all([
    listPayouts(creator.id),
    getPayoutSummary(creator.id),
    getEarningsByMonth(creator.id),
  ]);

  // Render boundary: the sparks take whole-token numbers, never wei.
  const monthlyTotals = earnings.map((point) =>
    Number(formatWei(point.catalogWei + point.requestsWei)),
  );
  const railTotals = summary.byRail.map((bucket) => Number(formatWei(bucket.totalWei)));
  const statusTotals = summary.byStatus.map((bucket) => Number(formatWei(bucket.totalWei)));
  const dominantRail = [...summary.byRail].sort((a, b) =>
    a.totalWei === b.totalWei ? 0 : a.totalWei > b.totalWei ? -1 : 1,
  )[0];

  return (
    <div className="space-y-6" data-tour="payouts">
      <PageHeader
        kicker="Creator"
        title="Payouts"
        description="What has been paid, what is still owed, and how it settles."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total paid"
          value={formatWei(summary.paidWei)}
          unit="IP"
          note="settled to you"
          color="green"
          spark={monthlyTotals}
        />
        <StatCard
          label="Pending / credited"
          value={formatWei(summary.pendingWei)}
          unit="IP"
          note="earned, not yet paid out"
          color="orange"
          spark={statusTotals}
        />
        <StatCard
          label="Next payout"
          value={
            summary.nextPayout ? formatWei(summary.nextPayout.amountWei) : "0"
          }
          unit="IP"
          note={
            summary.nextPayout
              ? `${RAIL_LABEL[summary.nextPayout.rail] ?? summary.nextPayout.rail} · ${summary.nextPayout.status}`
              : "nothing queued"
          }
          color="blue"
          spark={statusTotals}
        />
        <StatCard
          label="Payout rail"
          value={
            dominantRail ? (RAIL_LABEL[dominantRail.key] ?? dominantRail.key) : "—"
          }
          note={
            summary.byRail.length > 1
              ? summary.byRail
                  .map(
                    (bucket) =>
                      `${RAIL_LABEL[bucket.key] ?? bucket.key} ${bucket.count}`,
                  )
                  .join(" · ")
              : `preference: ${creator.payoutPref}`
          }
          color="purple"
          spark={railTotals}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown
              rows={summary.byStatus.map((bucket) => ({
                label: bucket.key,
                count: bucket.count,
                amountWei: bucket.totalWei,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By rail</CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown
              rows={summary.byRail.map((bucket) => ({
                label: RAIL_LABEL[bucket.key] ?? bucket.key,
                count: bucket.count,
                amountWei: bucket.totalWei,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every payout</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payouts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rail</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {RAIL_LABEL[payout.rail] ?? payout.rail}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatIp(payout.amountWei)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={payout.status === "failed" ? "destructive" : "secondary"}
                      >
                        {payout.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {payout.txHash ? (
                        <a
                          className="underline"
                          href={explorerTx(payout.txHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortHash(payout.txHash)}
                        </a>
                      ) : (
                        (payout.externalRef ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {payout.createdAt.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Breakdown({
  rows,
}: {
  rows: Array<{ label: string; count: number; amountWei: bigint }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.label} className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {row.label} · {row.count}
          </span>
          <span className="font-mono text-xs">{formatIp(row.amountWei)}</span>
        </li>
      ))}
    </ul>
  );
}
