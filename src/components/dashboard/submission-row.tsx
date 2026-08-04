"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  submitAssetAction,
  withdrawSubmissionAction,
} from "@/app/(dashboard)/requests/[id]/actions";

export function SubmissionControls({
  requestId,
  assetId,
  submissionStatus,
  requestOpen,
}: {
  requestId: string;
  assetId: string;
  submissionStatus: string | null;
  requestOpen: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (action: (r: string, a: string) => Promise<{ error: string | null }>) => {
    startTransition(async () => {
      const result = await action(requestId, assetId);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {submissionStatus === null ? (
        <Button
          size="sm"
          disabled={pending || !requestOpen}
          onClick={() => act(submitAssetAction)}
        >
          Submit
        </Button>
      ) : (
        <>
          <Badge variant={submissionStatus === "accepted" ? "default" : "outline"}>
            {submissionStatus}
          </Badge>
          {submissionStatus === "pending" && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(withdrawSubmissionAction)}
            >
              Withdraw
            </Button>
          )}
        </>
      )}
    </div>
  );
}
