"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  closeRequestAction,
  reviewSubmissionAction,
} from "@/app/(dashboard)/requests/[id]/actions";

export function ReviewControls({
  requestId,
  submissionId,
  status,
}: {
  requestId: string;
  submissionId: string;
  status: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status !== "pending") {
    return <Badge variant={status === "accepted" ? "default" : "outline"}>{status}</Badge>;
  }

  const decide = (decision: "accepted" | "rejected") => {
    startTransition(async () => {
      const result = await reviewSubmissionAction(requestId, submissionId, decision);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" disabled={pending} onClick={() => decide("accepted")}>
        Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("rejected")}>
        Reject
      </Button>
    </div>
  );
}

export function CloseRequestButton({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await closeRequestAction(requestId);
            setError(result.error);
          })
        }
      >
        {pending ? "Closing…" : "Close request"}
      </Button>
    </div>
  );
}
