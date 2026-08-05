import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { DitherAvatar } from "@/components/dither-kit/avatar";
import { DitherThumb } from "@/components/dither-kit/thumb";
import { thumbStyleFor } from "@/components/dither-kit/thumb-style";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listCatalog } from "@/lib/catalog/service";
import { withBasePath } from "@/lib/base-path";
import { formatIp, PRESET_NAME, PRESET_SENTENCE } from "@/lib/dashboard/format";
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

interface Filters {
  modality?: string;
  preset?: string;
  q?: string;
  train?: boolean;
  kyc?: boolean;
}

function filterHref(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.modality) query.set("modality", filters.modality);
  if (filters.preset) query.set("preset", filters.preset);
  if (filters.q) query.set("q", filters.q);
  if (filters.train) query.set("train", "1");
  if (filters.kyc) query.set("kyc", "1");
  const qs = query.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    modality?: string;
    preset?: string;
    q?: string;
    train?: string;
    kyc?: string;
  }>;
}) {
  const params = await searchParams;
  const filters: Filters = {
    modality: (MODALITIES as readonly string[]).includes(params.modality ?? "")
      ? params.modality
      : undefined,
    preset: (PRESETS as readonly string[]).includes(params.preset ?? "")
      ? params.preset
      : undefined,
    q: params.q?.trim() || undefined,
    train: params.train === "1",
    kyc: params.kyc === "1",
  };

  const items = await listCatalog({
    modality: filters.modality,
    licensePreset: filters.preset,
    search: filters.q,
    trainingOnly: filters.train,
    kycOnly: filters.kyc,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buyer surface"
        title="Catalog"
        description="Listed work across all creators — buying mints a real license token on Aeneid."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-5 rounded-xl border bg-card p-4">
          <form action={withBasePath("/catalog")}>
            {filters.modality && (
              <input type="hidden" name="modality" value={filters.modality} />
            )}
            {filters.preset && <input type="hidden" name="preset" value={filters.preset} />}
            {filters.train && <input type="hidden" name="train" value="1" />}
            {filters.kyc && <input type="hidden" name="kyc" value="1" />}
            <Input
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search files…"
              className="h-8 text-sm"
            />
          </form>

          <FilterGroup label="Modality">
            <FilterChip
              href={filterHref({ ...filters, modality: undefined })}
              label="All"
              active={!filters.modality}
            />
            {MODALITIES.map((value) => (
              <FilterChip
                key={value}
                href={filterHref({ ...filters, modality: value })}
                label={MODALITY_LABEL[value]}
                active={filters.modality === value}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="License terms">
            <FilterChip
              href={filterHref({ ...filters, preset: undefined })}
              label="Any"
              active={!filters.preset}
            />
            {PRESETS.map((value) => (
              <FilterChip
                key={value}
                href={filterHref({ ...filters, preset: value })}
                label={PRESET_NAME[value] ?? value}
                active={filters.preset === value}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Posture">
            <FilterChip
              href={filterHref({ ...filters, train: !filters.train })}
              label="Training permitted"
              active={!!filters.train}
            />
            <FilterChip
              href={filterHref({ ...filters, kyc: !filters.kyc })}
              label="KYC-verified creators"
              active={!!filters.kyc}
            />
          </FilterGroup>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {items.length} listing{items.length === 1 ? "" : "s"}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing listed under these filters yet. Registered assets appear here the
              moment their listing goes active.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const thumb = thumbStyleFor(item.modality);
                return (
                  <Link key={item.assetId} href={`/catalog/${item.assetId}`}>
                    <Card className="h-full overflow-hidden pt-0">
                      <div className="aspect-video w-full border-b bg-background">
                        {item.previewUrl &&
                        (item.modality === "image" || item.modality === "video") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.previewUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <DitherThumb
                            seed={item.assetId}
                            color={thumb.color}
                            variant={thumb.variant}
                          />
                        )}
                      </div>
                      <CardContent className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {item.filename ?? "untitled"}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <DitherAvatar name={item.creatorAnonId} size={14} />
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {item.creatorAnonId}
                              </span>
                              {item.creatorKycStatus === "verified" && (
                                <span className="font-mono text-[10px] uppercase tracking-wider text-[rgb(var(--tint-green))]">
                                  KYC
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 font-mono text-sm">
                            {formatIp(item.priceWei)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            {MODALITY_LABEL[item.modality] ?? item.modality}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {PRESET_NAME[item.licensePreset] ?? item.licensePreset}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-[10px] uppercase",
                              item.licensePreset === "WTR-NO-TRAIN"
                                ? "text-muted-foreground"
                                : "border-transparent bg-[rgb(var(--tint-blue)/0.12)] text-[rgb(var(--tint-blue))]",
                            )}
                          >
                            {item.licensePreset === "WTR-NO-TRAIN"
                              ? "aiLearningModels: false"
                              : "aiLearningModels: true"}
                          </Badge>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {PRESET_SENTENCE[item.licensePreset]}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5 font-mono text-xs">{children}</div>
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
