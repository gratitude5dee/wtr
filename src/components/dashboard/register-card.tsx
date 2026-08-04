"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  registerAssetAction,
  type RegisterState,
} from "@/app/(dashboard)/assets/[id]/register-actions";

const SUB_STEP_TEXT: Record<string, string> = {
  "3a": "Encrypted file stored",
  "3b": "Provenance recorded",
  "3c": "IP asset registered",
  "3d": "License vault created",
};

export function RegisterCard({
  assetId,
  failed,
  blockers,
  progress,
}: {
  assetId: string;
  /** Asset is in FAILED_REGISTER: show resume progress and a retry button. */
  failed: boolean;
  blockers: string[];
  progress: Record<string, boolean>;
}) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerAssetAction.bind(null, assetId),
    { error: null, registered: false },
  );

  if (state.registered) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registered</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your work is registered on-chain with your chosen license terms. Your labels
          are sealed into its permanent provenance record.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{failed ? "Registration paused" : "Register your work"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Registration seals your reviewed labels into the permanent provenance
            record and registers your work on-chain under your chosen license terms.
            Labels can no longer be edited afterwards.
          </p>
          {failed && (
            <div className="space-y-1">
              <p className="text-muted-foreground">
                A previous attempt stopped partway. Completed steps are saved — retrying
                resumes where it left off, nothing is redone:
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SUB_STEP_TEXT).map(([step, text]) => (
                  <Badge key={step} variant={progress[step] ? "secondary" : "outline"}>
                    {progress[step] ? "✓ " : ""}
                    {text}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {state.error && <p className="text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending || blockers.length > 0}>
            {pending ? "Registering…" : failed ? "Retry registration" : "Register"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
