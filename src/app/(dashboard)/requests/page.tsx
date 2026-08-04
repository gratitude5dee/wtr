import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIp, PRESET_NAME } from "@/lib/dashboard/format";
import { getCurrentCreator, listDataRequests } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const creator = await getCurrentCreator();
  const requests = await listDataRequests(creator?.id ?? null);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buyer surface"
        title="Lab data requests"
        description="Briefs from labs — answer them with work already listed under matching terms."
        actions={
          <Button asChild size="sm">
            <Link href="/requests/new">Post a request</Link>
          </Button>
        }
      />
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open requests right now. When a lab posts a brief your qualifying assets will
          show up here.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Lab</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Your submissions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">
                  <Link className="underline underline-offset-2" href={`/requests/${request.id}`}>
                    {request.title}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{request.requester}</TableCell>
                <TableCell>{PRESET_NAME[request.licensePreset] ?? request.licensePreset}</TableCell>
                <TableCell className="font-mono text-xs">{formatIp(request.budgetWei)}</TableCell>
                <TableCell>
                  <Badge variant={request.status === "open" ? "default" : "outline"}>
                    {request.status}
                  </Badge>
                </TableCell>
                <TableCell>{request.mySubmissions}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
