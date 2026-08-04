import { notFound, redirect } from "next/navigation";

import { BuyCard } from "@/components/dashboard/buy-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalogItem, purchaseReadiness } from "@/lib/catalog/service";
import { formatIp, PRESET_NAME, PRESET_SENTENCE } from "@/lib/dashboard/format";
import { getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const creator = await getCurrentCreator();
  if (!creator) redirect("/onboarding");

  const { id } = await params;
  const item = await getCatalogItem(id);
  if (!item) notFound();

  const readiness = await purchaseReadiness(
    { id: creator.id, anonId: creator.anonId, walletAddress: creator.walletAddress },
    id,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        kicker="Catalog"
        title={item.filename ?? "untitled"}
        description={`by ${item.creatorAnonId}`}
      />

      {item.previewUrl && (item.modality === "image" || item.modality === "video") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.previewUrl}
          alt=""
          className="w-full rounded-lg border object-cover"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">License</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {PRESET_NAME[item.licensePreset] ?? item.licensePreset}
            </Badge>
            <span className="font-mono text-sm">{formatIp(item.priceWei)}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {PRESET_SENTENCE[item.licensePreset] ?? ""}
          </p>
          <BuyCard
            assetId={item.assetId}
            priceLabel={formatIp(item.priceWei)}
            blockers={readiness?.blockers ?? []}
            alreadySettled={readiness?.alreadySettled ?? false}
            resumable={readiness?.resumable ?? false}
          />
        </CardContent>
      </Card>

      {item.labels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {item.labels.map((label) => (
                <div key={label.key} className="contents">
                  <dt className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {label.key}
                  </dt>
                  <dd className="truncate">{label.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
