"use client";

import { useState, useTransition } from "react";

import { purchaseAction } from "@/app/(dashboard)/catalog/[id]/actions";
import { Button } from "@/components/ui/button";

export function BuyCard({
  assetId,
  priceLabel,
  blockers,
  alreadySettled,
  resumable,
}: {
  assetId: string;
  priceLabel: string;
  blockers: string[];
  alreadySettled: boolean;
  resumable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error: string | null; settled: boolean }>({
    error: null,
    settled: alreadySettled,
  });

  if (state.settled) {
    return (
      <p className="text-sm text-[rgb(var(--tint-green))]">
        Sold — the license token was minted and the creator credited.
      </p>
    );
  }

  if (blockers.length > 0) {
    return (
      <ul className="space-y-1 text-sm text-muted-foreground">
        {blockers.map((blocker) => (
          <li key={blocker}>· {blocker}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2">
      {resumable && (
        <p className="text-sm text-[rgb(var(--tint-orange))]">
          Your license token was minted but the purchase did not finish settling — retry to
          complete it.
        </p>
      )}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState(await purchaseAction(assetId));
          })
        }
      >
        {pending
          ? "Minting license…"
          : resumable
            ? "Finish purchase"
            : `Buy license · ${priceLabel}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Mints a real license token on Aeneid to your wallet; the fee is read live from the
        chain, never hardcoded.
      </p>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}
