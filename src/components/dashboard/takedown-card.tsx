"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  withdrawAssetAction,
  type TakedownState,
} from "@/app/(dashboard)/assets/[id]/takedown-actions";

export function TakedownCard({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState<TakedownState, FormData>(
    withdrawAssetAction.bind(null, assetId),
    { error: null, done: false },
  );

  if (state.done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Withdrawn from sale</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No new licenses can be sold. The withdrawal was recorded in the permanent
          provenance record.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdraw from sale</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Withdrawing stops all future sales and is recorded permanently. Be clear
            about what it cannot undo:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Licenses already minted remain valid — they are the buyer&apos;s property.</li>
            <li>
              Decryptions already granted cannot be recalled; anyone who unlocked your
              file keeps their copy.
            </li>
          </ul>
          <div className="space-y-2">
            <Label htmlFor="reason">Why are you withdrawing this?</Label>
            <Textarea id="reason" name="reason" required maxLength={1000} />
          </div>
          <label className="flex items-start gap-2 text-muted-foreground">
            <input type="checkbox" name="acknowledge" required className="mt-1" />
            <span>
              I understand existing licenses stay valid and prior decryptions cannot be
              recalled.
            </span>
          </label>
          {state.error && <p className="text-destructive">{state.error}</p>}
          <Button type="submit" variant="destructive" disabled={pending}>
            Withdraw from sale
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
