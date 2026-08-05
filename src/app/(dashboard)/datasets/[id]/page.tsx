import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { DatasetSnapshotForm } from "@/components/dashboard/dataset-snapshot-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withBasePath } from "@/lib/base-path";
import { getCurrentCreator } from "@/lib/dashboard/queries";
import { EXPORT_TEMPLATES, EXPORT_TEMPLATE_LABEL } from "@/lib/datasets/export";
import { getDataset, listSnapshots, previewDataset } from "@/lib/datasets/service";

export const dynamic = "force-dynamic";

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCurrentCreator();
  const dataset = await getDataset(id);
  // A dataset is only ever visible to its owner — including when no identity
  // resolves at all, which must not read as "no owner to compare against".
  if (!creator || !dataset || dataset.ownerCreatorId !== creator.id) notFound();

  const [preview, snapshots] = await Promise.all([
    previewDataset(dataset.filters),
    listSnapshots(dataset.id),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        kicker="Finetuning playground"
        title={dataset.name}
        description="A saved catalog query. Snapshots freeze its membership so an export stays reproducible."
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
            {JSON.stringify(dataset.filters, null, 2)}
          </pre>
          <p className="font-mono text-xs text-muted-foreground">
            {preview.length} training-licensed asset{preview.length === 1 ? "" : "s"} match right now
          </p>
          <DatasetSnapshotForm datasetId={dataset.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snapshots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No snapshots yet. Take one to export.
            </p>
          ) : (
            snapshots.map((snapshot) => (
              <div key={snapshot.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-xs text-muted-foreground">
                    {snapshot.createdAt.toISOString()}
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {snapshot.itemCount} asset{snapshot.itemCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {EXPORT_TEMPLATES.map((template) => (
                    <span key={template} className="flex items-center gap-1.5">
                      {/* Plain anchors: these are file downloads, and `next/link`
                          would apply the basePath `withBasePath` already added. */}
                      <a
                        className="underline"
                        href={withBasePath(
                          `/api/datasets/snapshots/${snapshot.id}/export?template=${template}`,
                        )}
                      >
                        {EXPORT_TEMPLATE_LABEL[template]}
                      </a>
                      <a
                        className="text-muted-foreground underline"
                        href={withBasePath(
                          `/api/datasets/snapshots/${snapshot.id}/export?template=${template}&part=card`,
                        )}
                      >
                        card
                      </a>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
