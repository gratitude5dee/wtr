import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { DatasetBuilderForm } from "@/components/dashboard/dataset-builder-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentCreator } from "@/lib/dashboard/queries";
import { listDatasets, previewDataset } from "@/lib/datasets/service";

export const dynamic = "force-dynamic";

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<{ modality?: string; preset?: string; q?: string; kyc?: string }>;
}) {
  const params = await searchParams;
  const creator = await getCurrentCreator();
  const defaults = {
    modality: params.modality?.trim() || undefined,
    preset: params.preset?.trim() || undefined,
    q: params.q?.trim() || undefined,
    kyc: params.kyc === "on" || params.kyc === "1",
  };

  const [preview, datasets] = await Promise.all([
    previewDataset({
      modality: defaults.modality,
      licensePreset: defaults.preset,
      search: defaults.q,
      kycOnly: defaults.kyc,
    }),
    creator ? listDatasets(creator.id) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        kicker="Finetuning playground"
        title="Datasets"
        description="Compose a training set from listed work. Only listings whose terms permit AI training are ever included — WTR-NO-TRAIN work cannot enter a dataset."
      />

      <Card>
        <CardHeader>
          <CardTitle>Build a dataset</CardTitle>
        </CardHeader>
        <CardContent>
          <DatasetBuilderForm defaults={defaults} matchCount={preview.length} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved datasets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {datasets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. A dataset is a saved query — snapshot it when you want a
              frozen, exportable membership.
            </p>
          ) : (
            datasets.map((dataset) => (
              <Link
                key={dataset.id}
                href={`/datasets/${dataset.id}`}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{dataset.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {dataset.createdAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] uppercase">
                  {dataset.snapshotCount} snapshot{dataset.snapshotCount === 1 ? "" : "s"}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
