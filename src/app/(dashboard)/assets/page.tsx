import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BulkActions } from "@/components/dashboard/bulk-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { DitherThumb } from "@/components/dither-kit/thumb";
import { thumbStyleFor } from "@/components/dither-kit/thumb-style";
import {
  formatIp,
  PRESET_NAME,
  shortHash,
  STAGE_LABEL,
  STAGE_TINT,
} from "@/lib/dashboard/format";
import { getCurrentCreator, listAssets } from "@/lib/dashboard/queries";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGES = [
  "IN_TRAY",
  "LABELED",
  "REGISTERED",
  "LISTED",
  "SOLD",
  "SETTLED",
  "FAILED_REGISTER",
] as const;

function formatBytes(bytes: string | null): string {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const params = await searchParams;
  const stage = (STAGES as readonly string[]).includes(params.stage ?? "")
    ? params.stage
    : undefined;
  const query = params.q?.trim() || undefined;

  const creator = await getCurrentCreator();
  const allAssets = creator ? await listAssets(creator.id) : [];
  const counts = new Map<string, number>();
  for (const asset of allAssets) {
    counts.set(asset.stage, (counts.get(asset.stage) ?? 0) + 1);
  }
  const assets = allAssets.filter(
    (asset) =>
      (!stage || asset.stage === stage) &&
      (!query ||
        (asset.filename ?? asset.id).toLowerCase().includes(query.toLowerCase())),
  );

  const chipHref = (value?: string) => {
    const qs = new URLSearchParams();
    if (value) qs.set("stage", value);
    if (query) qs.set("q", query);
    const s = qs.toString();
    return s ? `/assets?${s}` : "/assets";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Creator"
        title="Assets"
        description="Everything you’ve added, from tray to settlement."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link href="/upload/bulk">Bulk upload</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/upload">Upload</Link>
            </Button>
          </div>
        }
      />

      <BulkActions
        assets={allAssets
          .filter((asset) => asset.stage === "IN_TRAY" || asset.stage === "LABELED")
          .map((asset) => ({
            id: asset.id,
            filename: asset.filename,
            stage: asset.stage,
          }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 font-mono text-xs">
          <StageChip href={chipHref()} label={`All ${allAssets.length}`} active={!stage} />
          {STAGES.map((value) => {
            const count = counts.get(value) ?? 0;
            if (count === 0) return null;
            return (
              <StageChip
                key={value}
                href={chipHref(value)}
                label={`${STAGE_LABEL[value]} ${count}`}
                active={stage === value}
              />
            );
          })}
        </div>
        <form action={withBasePath("/assets")} className="flex items-center gap-2">
          {stage && <input type="hidden" name="stage" value={stage} />}
          <Input
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder="Search files…"
            className="h-8 w-52 text-sm"
          />
        </form>
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {allAssets.length === 0 ? (
            <>
              No assets yet.{" "}
              <Link className="underline" href="/upload">
                Upload a file
              </Link>{" "}
              to start the pipeline.
            </>
          ) : (
            "Nothing matches these filters."
          )}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border" data-tour="assets-list">
          {assets.map((asset) => {
            const thumb = thumbStyleFor(asset.modality);
            const failed = asset.stage === "FAILED_REGISTER";
            const withdrawn = asset.listingStatus === "withdrawn";
            return (
              <Link
                key={asset.id}
                href={`/assets/${asset.id}`}
                className={cn(
                  "grid grid-cols-[64px_minmax(140px,1.4fr)_110px_minmax(120px,1fr)_90px_110px_90px] items-center gap-4 border-b bg-card px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/40",
                  failed && "bg-[rgb(var(--tint-red)/0.04)]",
                )}
              >
                <div className="h-9 w-16 overflow-hidden rounded-md border bg-background">
                  <DitherThumb seed={asset.id} color={failed ? "red" : thumb.color} variant={thumb.variant} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {asset.filename ?? asset.id.slice(0, 8)}
                    </span>
                    {asset.duplicateClaimFlag && (
                      <Badge variant="destructive" className="shrink-0 text-[10px]">
                        duplicate claim
                      </Badge>
                    )}
                    {withdrawn && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        withdrawn
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {shortHash(asset.contentSha256, 6)} · {formatBytes(asset.byteSize)}
                  </div>
                </div>
                <div>
                  <Badge variant="outline" className={STAGE_TINT[asset.stage]}>
                    {STAGE_LABEL[asset.stage] ?? asset.stage}
                  </Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {asset.licensePreset
                    ? (PRESET_NAME[asset.licensePreset] ?? asset.licensePreset)
                    : "no license yet"}
                </div>
                <div className="font-mono text-xs">
                  {asset.priceWei !== null ? formatIp(asset.priceWei) : "—"}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {asset.salesCount > 0
                    ? `${asset.salesCount} sold · ${formatIp(asset.grossWei)}`
                    : "never sold"}
                </div>
                <div className="text-right font-mono text-xs text-muted-foreground">
                  {asset.createdAt.toLocaleDateString()}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StageChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2.5 py-1 uppercase tracking-wider transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
