import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getCurrentCreator, listPayouts, listSales } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function EarningsPage() {
  const creator = await getCurrentCreator();
  const [sales, payouts] = creator
    ? await Promise.all([listSales(creator.id), listPayouts(creator.id)])
    : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Creator"
        title="Earnings"
        description="Sales and payouts, settled in test funds on Aeneid."
      />

      <Card>
        <CardHeader>
          <CardTitle>Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <Link className="underline-offset-2 hover:underline" href={`/assets/${sale.assetId}`}>
                        {sale.filename ?? sale.assetId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {sale.channel === "catalog" ? "Catalog" : "Lab request"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatIp(sale.amountWei)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {sale.txHash ? (
                        <a className="underline" href={explorerTx(sale.txHash)} target="_blank" rel="noreferrer">
                          {shortHash(sale.txHash)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sale.createdAt.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {payouts.length === 0 ? (
            <p className="text-muted-foreground">No payouts yet.</p>
          ) : (
            <p className="text-muted-foreground">
              {payouts.length} payout{payouts.length === 1 ? "" : "s"} across{" "}
              <span className="font-mono text-xs text-foreground">
                {formatIp(payouts.reduce((sum, payout) => sum + payout.amountWei, 0n))}
              </span>
              .
            </p>
          )}
          <Button asChild size="sm" variant="secondary">
            <Link href="/payouts">Open payouts</Link>
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}
