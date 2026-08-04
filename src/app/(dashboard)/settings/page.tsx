import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { DitherAvatar } from "@/components/dither-kit/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortHash } from "@/lib/dashboard/format";
import { getCurrentCreator, listConsentHistory } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

function StatusBadge({ value, good }: { value: string; good: string[] }) {
  return <Badge variant={good.includes(value) ? "secondary" : "outline"}>{value}</Badge>;
}

export default async function SettingsPage() {
  const creator = await getCurrentCreator();
  const consents = creator ? await listConsentHistory(creator.id) : [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader kicker="Account" title="Settings" />

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
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <DitherAvatar name={creator.avatarSeed} size={48} />
                <div>
                  <div className="font-medium">{creator.displayName ?? creator.anonId}</div>
                  <div className="text-xs text-muted-foreground">
                    Public pseudonym: <span className="font-mono">{creator.anonId}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">KYC</span>
                <StatusBadge value={creator.kycStatus} good={["verified"]} />
              </div>
            </CardContent>
          </Card>

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
                <ul className="space-y-3">
                  {consents.map((consent, index) => (
                    <li key={index} className="space-y-1 text-sm">
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium">
                          {consent.documentUri ? (
                            <Link className="underline underline-offset-2" href={consent.documentUri}>
                              {consent.documentVersion}
                            </Link>
                          ) : (
                            consent.documentVersion
                          )}
                          {consent.privacyVersion && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              + {consent.privacyVersion}
                            </span>
                          )}
                          {consent.revokedAt && (
                            <Badge variant="outline" className="ml-2">
                              superseded
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          accepted {consent.acceptedAt.toLocaleString()}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        document hash {shortHash(consent.documentSha256, 12)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
