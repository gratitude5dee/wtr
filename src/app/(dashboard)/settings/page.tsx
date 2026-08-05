import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { DitherAvatar } from "@/components/dither-kit/avatar";
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
import { shortHash } from "@/lib/dashboard/format";
import { getCurrentCreator, listConsentHistory } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const creator = await getCurrentCreator();
  const consents = creator ? await listConsentHistory(creator.id) : [];

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        kicker="Account"
        title="Settings"
        description="Identity, verification, consent, and how you get paid."
      />

      {!creator ? (
        <p className="text-sm text-muted-foreground">
          No creator account exists yet.{" "}
          <Link className="underline" href="/onboarding">
            Create one and accept the terms
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <DitherAvatar name={creator.avatarSeed} size={44} className="rounded-md" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {creator.displayName ?? creator.anonId}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {creator.anonId}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  KYC
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Badge
                  variant="outline"
                  className={
                    creator.kycStatus === "verified"
                      ? "border-transparent bg-[rgb(var(--tint-green)/0.12)] font-mono text-[10px] uppercase tracking-wider text-[rgb(var(--tint-green))]"
                      : "font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  }
                >
                  {creator.kycStatus}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {creator.kycStatus === "verified"
                    ? `Verified${creator.kycCountry ? ` · ${creator.kycCountry}` : ""}. Unlocks KYC-only briefs.`
                    : "Some briefs accept KYC-verified contributors only."}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Tax
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] uppercase tracking-wider"
                >
                  {creator.taxStatus}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Tax documentation is collected before your first fiat payout.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payout &amp; identity details</CardTitle>
            </CardHeader>
            <CardContent>
              <SettingsForm
                displayName={creator.displayName}
                walletAddress={creator.walletAddress}
                payoutPref={creator.payoutPref}
                taxStatus={creator.taxStatus}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consent history</CardTitle>
            </CardHeader>
            <CardContent>
              {consents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No consent on file. You must accept the terms before uploading.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Document hash</TableHead>
                      <TableHead>Privacy</TableHead>
                      <TableHead>Accepted</TableHead>
                      <TableHead>State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consents.map((consent, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {consent.documentUri ? (
                            <Link
                              className="underline underline-offset-2"
                              href={consent.documentUri}
                            >
                              {consent.documentVersion}
                            </Link>
                          ) : (
                            consent.documentVersion
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {shortHash(consent.documentSha256, 8)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {consent.privacyVersion ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {consent.acceptedAt.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {consent.revokedAt ? (
                            <Badge variant="outline" className="font-mono text-[10px] uppercase">
                              superseded
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-[rgb(var(--tint-green)/0.12)] font-mono text-[10px] uppercase text-[rgb(var(--tint-green))]"
                            >
                              active
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
