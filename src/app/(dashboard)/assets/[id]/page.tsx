import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  eventLabel,
  explorerIpUrl,
  formatIp,
  ipfsUrl,
  PRESET_NAME,
  PRESET_SENTENCE,
  shortHash,
  STAGE_LABEL,
  STAGE_TONE,
} from "@/lib/dashboard/format";
import { getAssetDetail, getCurrentCreator } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

function IdRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : href ? (
        <a
          className="truncate font-mono text-xs underline underline-offset-2"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {shortHash(value, 12)}
        </a>
      ) : (
        <span className="truncate font-mono text-xs" title={value}>
          {shortHash(value, 12)}
        </span>
      )}
    </div>
  );
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCurrentCreator();
  if (!creator) notFound();
  const asset = await getAssetDetail(creator.id, id);
  if (!asset) notFound();

  const preset = asset.listing?.licensePreset ?? null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{asset.filename ?? asset.id.slice(0, 8)}</h1>
        <Badge variant={STAGE_TONE[asset.stage] ?? "outline"}>
          {STAGE_LABEL[asset.stage] ?? asset.stage}
        </Badge>
        {asset.duplicateClaimFlag && (
          <Badge variant="destructive">duplicate claim — under human review</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s public, what&apos;s encrypted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {asset.previewUrl ? (
            <p>
              The{" "}
              <a className="underline" href={asset.previewUrl} target="_blank" rel="noreferrer">
                preview
              </a>{" "}
              is public and deliberately degraded — it is not usable as training data.
            </p>
          ) : (
            <p className="text-muted-foreground">No public preview has been generated yet.</p>
          )}
          <p>
            Your full-resolution original was encrypted on your device before upload.
            {asset.ipfsCid
              ? " The ciphertext lives on IPFS; the key sits behind a license-gated vault. WTR never holds the plaintext."
              : " It has not been uploaded yet."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>License</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {preset ? (
            <div className="space-y-1">
              <div className="font-medium">{PRESET_NAME[preset] ?? preset}</div>
              <p>{PRESET_SENTENCE[preset] ?? ""}</p>
              {asset.listing && (
                <p className="text-muted-foreground">
                  You get {formatIp(asset.listing.priceWei)} per license.
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Not listed yet — no license terms attached.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provenance record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <IdRow label="Content hash (SHA-256)" value={asset.contentSha256} />
          <IdRow label="Trace record" value={asset.traceDataId} />
          <IdRow
            label="IP Asset"
            value={asset.ipId}
            href={asset.ipId ? explorerIpUrl(asset.ipId) : undefined}
          />
          <IdRow
            label="Encrypted file (IPFS)"
            value={asset.ipfsCid}
            href={asset.ipfsCid ? ipfsUrl(asset.ipfsCid) : undefined}
          />
          <IdRow
            label="Access vault"
            value={asset.cdrVaultUuid === null ? null : String(asset.cdrVaultUuid)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Labels</CardTitle>
        </CardHeader>
        <CardContent>
          {asset.labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No labels yet.</p>
          ) : (
            <ul className="space-y-2">
              {asset.labels.map((label) => (
                <li
                  key={`${label.namespace}:${label.key}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    <span className="text-muted-foreground">{label.key}:</span>{" "}
                    {typeof label.value === "string" ? label.value : JSON.stringify(label.value)}
                  </span>
                  <span className="flex items-center gap-2">
                    {label.source === "model" && !label.confirmedByCreator ? (
                      <Badge variant="outline">machine-generated</Badge>
                    ) : (
                      <Badge variant="secondary">confirmed by you</Badge>
                    )}
                    {label.confidence !== null && label.source === "model" && (
                      <span className="text-xs text-muted-foreground">
                        {(label.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {asset.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ol className="space-y-3">
              {asset.events.map((event) => (
                <li key={event.seq} className="flex items-baseline justify-between text-sm">
                  <span>
                    {eventLabel(event.eventType)}
                    {event.promotedToTrace && (
                      <Badge variant="outline" className="ml-2">
                        recorded in Trace
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {event.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Separator />
      <Link className="text-sm text-muted-foreground underline" href="/assets">
        ← Back to assets
      </Link>
    </div>
  );
}
