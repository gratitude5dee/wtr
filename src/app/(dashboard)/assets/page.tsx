import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { shortHash, STAGE_LABEL, STAGE_TINT } from "@/lib/dashboard/format";
import { getCurrentCreator, listAssets } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const creator = await getCurrentCreator();
  const assets = creator ? await listAssets(creator.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Creator"
        title="Assets"
        description="Everything you’ve added, from tray to settlement."
      />
      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No assets yet.{" "}
          <Link className="underline" href="/upload">
            Upload a file
          </Link>{" "}
          to start the pipeline.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Content hash</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <Link className="font-medium underline-offset-2 hover:underline" href={`/assets/${asset.id}`}>
                    {asset.filename ?? asset.id.slice(0, 8)}
                  </Link>
                  {asset.duplicateClaimFlag && (
                    <Badge variant="destructive" className="ml-2">
                      duplicate claim
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{asset.modality}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STAGE_TINT[asset.stage]}>
                    {STAGE_LABEL[asset.stage] ?? asset.stage}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {shortHash(asset.contentSha256)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {asset.createdAt.toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
