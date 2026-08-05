import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DitherAvatar } from "@/components/dither-kit/avatar";
import { formatIp, fundingLabel, PRESET_NAME } from "@/lib/dashboard/format";
import { getCurrentCreator, listDataRequests } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

const MODALITY_LABEL: Record<string, string> = {
  audio: "Audio",
  image: "Image",
  video: "Video",
  "3d": "3D",
  threed: "3D",
  motion: "Motion",
};

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
          <Button asChild size="sm" data-tour="requests-new">
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
        <div className="grid gap-4 lg:grid-cols-2" data-tour="requests-list">
          {requests.map((request) => {
            const target =
              request.unitPriceWei && request.unitPriceWei > 0n
                ? Number(request.budgetWei / request.unitPriceWei)
                : null;
            const matchedPct =
              target && target > 0
                ? Math.min(100, Math.round((request.totalSubmissions / target) * 100))
                : null;
            return (
              <Card key={request.id} className="overflow-hidden">
                <CardContent className="flex flex-col gap-4 pt-5">
                  <div className="flex items-center gap-3">
                    <DitherAvatar name={request.requester} size={32} className="rounded-md" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{request.requester}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {request.id.slice(0, 8)}
                        {request.deadline &&
                          ` · closes ${request.deadline.toLocaleDateString()}`}
                      </div>
                    </div>
                    <Badge
                      variant={request.status === "open" ? "default" : "outline"}
                      className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider"
                    >
                      {request.status}
                    </Badge>
                  </div>

                  <div>
                    <Link
                      className="text-base font-semibold underline-offset-2 hover:underline"
                      href={`/requests/${request.id}`}
                    >
                      {request.title}
                    </Link>
                    {request.notes && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {request.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {request.modality && request.modality !== "any" && (
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {MODALITY_LABEL[request.modality] ?? request.modality}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {PRESET_NAME[request.licensePreset] ?? request.licensePreset}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        request.fundingMode === "none"
                          ? "text-[10px] text-muted-foreground"
                          : "border-transparent bg-[rgb(var(--tint-green)/0.12)] text-[10px] text-[rgb(var(--tint-green))]"
                      }
                    >
                      {fundingLabel(
                        request.fundingMode,
                        request.budgetWei,
                        request.amountPaidWei,
                      )}
                    </Badge>
                    {request.kycRequired && (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-[rgb(var(--tint-orange)/0.12)] text-[10px] text-[rgb(var(--tint-orange))]"
                      >
                        KYC required
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Per asset
                      </div>
                      <div className="font-mono">
                        {request.unitPriceWei !== null ? formatIp(request.unitPriceWei) : "negotiated"}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Total budget
                      </div>
                      <div className="font-mono">{formatIp(request.budgetWei)}</div>
                    </div>
                  </div>

                  {request.dataShape && Object.keys(request.dataShape).length > 0 && (
                    <div className="font-mono text-[11px] text-muted-foreground">
                      shape:{" "}
                      {Object.entries(request.dataShape)
                        .map(([field, type]) => `${field}: ${type}`)
                        .join(" · ")}
                    </div>
                  )}

                  {request.specialInstructions && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {request.specialInstructions}
                    </p>
                  )}

                  {matchedPct !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                        <span>
                          {request.totalSubmissions} of ~{target} matched
                        </span>
                        <span>{matchedPct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[rgb(var(--tint-blue))] transition-[width] duration-700"
                          style={{ width: `${matchedPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      {creator
                        ? request.mySubmissions > 0
                          ? `You’ve submitted ${request.mySubmissions}`
                          : "You haven’t submitted yet"
                        : "Sign in to submit your work"}
                    </span>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/requests/${request.id}`}>
                        {creator ? "Review & submit" : "View brief"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Demo briefs styled after real labs — not affiliated with or endorsed by the named
        companies.
      </p>
    </div>
  );
}
