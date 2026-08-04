import Link from "next/link";
import { notFound } from "next/navigation";

import { CloseRequestButton, ReviewControls } from "@/components/dashboard/review-controls";
import { SubmissionControls } from "@/components/dashboard/submission-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIp, PRESET_NAME, PRESET_SENTENCE } from "@/lib/dashboard/format";
import { getCurrentCreator } from "@/lib/dashboard/queries";
import { eligibleAssets, getRequest, listSubmissionsForReview } from "@/lib/requests/service";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCurrentCreator();
  if (!creator) notFound();
  const request = await getRequest(id).catch(() => null);
  if (!request) notFound();
  const isRequester = request.requesterCreatorId === creator.id;
  const assets = isRequester ? [] : await eligibleAssets(creator.id, request.id);
  const submissions = isRequester ? await listSubmissionsForReview(creator.id, request.id) : [];

  const specEntries = Object.entries(request.spec).filter(
    ([, value]) => typeof value === "string" || typeof value === "number",
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {request.requesterAnonId}
          </div>
          <h1 className="text-xl font-semibold">{request.title}</h1>
        </div>
        <Badge variant={request.status === "open" ? "default" : "outline"}>
          {request.status}
        </Badge>
        {isRequester && <Badge variant="secondary">your request</Badge>}
        {isRequester && request.status === "open" && (
          <CloseRequestButton requestId={request.id} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What the lab is asking for</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <div className="font-medium">
              {PRESET_NAME[request.licensePreset] ?? request.licensePreset}
            </div>
            <p className="text-muted-foreground">
              {PRESET_SENTENCE[request.licensePreset] ?? ""}
            </p>
          </div>
          <p>
            Budget: <span className="font-mono text-xs">{formatIp(request.budgetWei)}</span>
            {request.unitPriceWei !== null && (
              <>
                {" \u00b7 "}per item{" "}
                <span className="font-mono text-xs">{formatIp(request.unitPriceWei)}</span>
              </>
            )}
            {request.deadline && (
              <>
                {" \u00b7 "}deadline{" "}
                <span className="font-mono text-xs">
                  {request.deadline.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </>
            )}
            {request.kycRequired && " \u00b7 KYC-verified creators only"}
          </p>
          {specEntries.length > 0 && (
            <dl className="space-y-1">
              {specEntries.map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">{key.replaceAll("_", " ")}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {isRequester ? (
        <Card>
          <CardHeader>
            <CardTitle>Submissions to review</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="mb-4 text-muted-foreground">
              Accepting a submission is final — accepted work feeds the deliverable.
              Only creators whose listings match your license terms could submit.
            </p>
            {submissions.length === 0 ? (
              <p className="text-muted-foreground">No submissions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>KYC</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => (
                    <TableRow key={submission.submissionId}>
                      <TableCell>{submission.filename ?? submission.assetId.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {submission.creatorAnonId}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            submission.creatorKycStatus === "verified" ? "default" : "outline"
                          }
                        >
                          {submission.creatorKycStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ReviewControls
                          requestId={request.id}
                          submissionId={submission.submissionId}
                          status={submission.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Your qualifying work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="mb-4 text-muted-foreground">
            Only work with an active listing under the lab&apos;s exact license terms
            qualifies. Submitting records your interest — a sale still settles through
            your license, never around it.
          </p>
          {assets.length === 0 ? (
            <p className="text-muted-foreground">
              None of your listed work matches these license terms yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Submission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.assetId}>
                    <TableCell>
                      <Link className="underline underline-offset-2" href={`/assets/${asset.assetId}`}>
                        {asset.filename ?? asset.assetId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SubmissionControls
                        requestId={request.id}
                        assetId={asset.assetId}
                        submissionStatus={asset.submissionStatus}
                        requestOpen={request.status === "open"}
                        eligible={asset.eligible}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
