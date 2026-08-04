import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sessionsEnabled } from "@/lib/auth/session";
import { CURRENT_PRIVACY, CURRENT_TOS } from "@/lib/consent/documents";
import { hasCurrentConsent } from "@/lib/consent/service";
import { getCurrentCreator } from "@/lib/dashboard/queries";

import { acceptLatestConsentAction, onboardAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_TEXT: Record<string, string> = {
  name: "Enter a display name.",
  accept: "You must accept the terms before creating an account.",
  wallet: "Connect and sign with your wallet first, then create the account.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const creator = await getCurrentCreator();
  if (creator && (await hasCurrentConsent(creator.id))) redirect("/upload");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {creator ? "The terms have changed" : "Welcome to WTR"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {creator
            ? "Accept the current terms to keep uploading. Assets you already listed stay under the terms you listed them with."
            : "Before your first upload, read and accept the terms. What you accept — version, hash and time — is recorded permanently."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Link className="underline underline-offset-2" href={CURRENT_TOS.uri}>
              Terms of Service
            </Link>{" "}
            <span className="font-mono text-xs text-muted-foreground">{CURRENT_TOS.version}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">
            {CURRENT_TOS.text}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Link className="underline underline-offset-2" href={CURRENT_PRIVACY.uri}>
              Privacy Policy
            </Link>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {CURRENT_PRIVACY.version}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-muted-foreground">
            {CURRENT_PRIVACY.text}
          </pre>
        </CardContent>
      </Card>

      {error && ERROR_TEXT[error] && (
        <p className="text-sm text-destructive">{ERROR_TEXT[error]}</p>
      )}

      {creator ? (
        <form action={acceptLatestConsentAction}>
          <Button type="submit">I accept the current terms</Button>
        </form>
      ) : (
        <form action={onboardAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" required placeholder="How you appear to labs" />
          </div>
          {!sessionsEnabled() && (
            <div className="space-y-2">
              <Label htmlFor="walletAddress">Wallet address (optional, Aeneid)</Label>
              <Input
                id="walletAddress"
                name="walletAddress"
                placeholder="0x… — you can connect later"
                pattern="0x[0-9a-fA-F]{40}"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="accept" name="accept" required />
            <Label htmlFor="accept" className="text-sm font-normal">
              I have read and accept the Terms of Service and Privacy Policy
            </Label>
          </div>
          <Button type="submit">Create account and accept</Button>
        </form>
      )}
    </div>
  );
}
