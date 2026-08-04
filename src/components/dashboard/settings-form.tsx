"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  updateSettingsAction,
  type SettingsState,
} from "@/app/(dashboard)/settings/actions";

export function SettingsForm({
  displayName,
  walletAddress,
  payoutPref,
  taxStatus,
}: {
  displayName: string | null;
  walletAddress: string | null;
  payoutPref: string;
  taxStatus: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateSettingsAction,
    { error: null, saved: false },
  );

  return (
    <form action={formAction} className="space-y-4 text-sm">
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" defaultValue={displayName ?? ""} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="walletAddress">Wallet address (Aeneid)</Label>
        <Input
          id="walletAddress"
          name="walletAddress"
          defaultValue={walletAddress ?? ""}
          placeholder="0x…"
          pattern="0x[0-9a-fA-F]{40}"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Payout preference</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="payoutPref" value="onchain" defaultChecked={payoutPref === "onchain"} />
          <span>On-chain wallet</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="payoutPref" value="fiat" defaultChecked={payoutPref === "fiat"} />
          <span>Bank account (fiat rail)</span>
        </label>
      </fieldset>

      {taxStatus === "not_submitted" ? (
        <label className="flex items-start gap-2 text-muted-foreground">
          <input type="checkbox" name="taxSubmitted" className="mt-1" />
          <span>I have submitted my tax form.</span>
        </label>
      ) : (
        <p className="text-muted-foreground">Tax form: {taxStatus}.</p>
      )}

      {state.error && <p className="text-destructive">{state.error}</p>}
      {state.saved && !state.error && <p className="text-muted-foreground">Saved.</p>}

      <Button type="submit" disabled={pending}>
        Save settings
      </Button>
    </form>
  );
}
