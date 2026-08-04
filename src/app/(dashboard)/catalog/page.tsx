import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listCatalog } from "@/lib/catalog/service";
import { formatIp, PRESET_NAME } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MODALITIES = ["audio", "image", "video", "threed", "motion"] as const;
const PRESETS = ["WTR-TRAIN-EXCLUSIVE", "WTR-TRAIN-NONEXCLUSIVE", "WTR-NO-TRAIN"] as const;

const MODALITY_LABEL: Record<string, string> = {
  audio: "Audio",
  image: "Image",
  video: "Video",
  threed: "3D",
  motion: "Motion",
};

function filterHref(params: { modality?: string; preset?: string }): string {
  const query = new URLSearchParams();
  if (params.modality) query.set("modality", params.modality);
  if (params.preset) query.set("preset", params.preset);
  const qs = query.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ modality?: string; preset?: string }>;
}) {
  const params = await searchParams;
  const modality = (MODALITIES as readonly string[]).includes(params.modality ?? "")
    ? params.modality
    : undefined;
  const preset = (PRESETS as readonly string[]).includes(params.preset ?? "")
    ? params.preset
    : undefined;

  const items = await listCatalog({ modality, licensePreset: preset });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buyer surface"
        title="Catalog"
        description="Listed work across all creators — buying mints a real license token on Aeneid."
      />

      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">Modality</span>
        <FilterChip href={filterHref({ preset })} label="All" active={!modality} />
        {MODALITIES.map((value) => (
          <FilterChip
            key={value}
            href={filterHref({ modality: value, preset })}
            label={MODALITY_LABEL[value]}
            active={modality === value}
          />
        ))}
        <span className="ml-4 uppercase tracking-wider text-muted-foreground">Terms</span>
        <FilterChip href={filterHref({ modality })} label="All" active={!preset} />
        {PRESETS.map((value) => (
          <FilterChip
            key={value}
            href={filterHref({ modality, preset: value })}
            label={PRESET_NAME[value] ?? value}
            active={preset === value}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing listed under these filters yet. Registered assets appear here the moment
          their listing goes active.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.assetId} href={`/catalog/${item.assetId}`}>
              <Card className="h-full transition-colors hover:border-[var(--input)]">
                <CardContent className="space-y-3 pt-6">
                  {item.previewUrl && (item.modality === "image" || item.modality === "video") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="aspect-video w-full rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-md border bg-muted font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {MODALITY_LABEL[item.modality] ?? item.modality} · degraded preview only
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.filename ?? "untitled"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        by {item.creatorAnonId}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-sm">{formatIp(item.priceWei)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {MODALITY_LABEL[item.modality] ?? item.modality}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {PRESET_NAME[item.licensePreset] ?? item.licensePreset}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2.5 py-0.5 transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
