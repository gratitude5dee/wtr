"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRESET_NAME, PRESET_SENTENCE } from "@/lib/dashboard/format";

import {
  chooseLicenseAction,
  type LicenseChoiceState,
} from "@/app/(dashboard)/assets/[id]/license-actions";

const PRESETS = ["WTR-TRAIN-EXCLUSIVE", "WTR-TRAIN-NONEXCLUSIVE", "WTR-NO-TRAIN"] as const;

export function LicensePicker({
  assetId,
  currentPreset,
  currentAskIp,
}: {
  assetId: string;
  currentPreset: string | null;
  currentAskIp: string | null;
}) {
  const [state, formAction, pending] = useActionState<LicenseChoiceState, FormData>(
    chooseLicenseAction.bind(null, assetId),
    { error: null, saved: false },
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        {PRESETS.map((preset) => (
          <label
            key={preset}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="preset"
              value={preset}
              defaultChecked={currentPreset === preset}
              required
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">{PRESET_NAME[preset]}</span>
              <span className="block text-sm text-muted-foreground">
                {PRESET_SENTENCE[preset]}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="askPriceIp">Your price per license (IP)</Label>
        <Input
          id="askPriceIp"
          name="askPriceIp"
          inputMode="decimal"
          placeholder="e.g. 10"
          defaultValue={currentAskIp ?? ""}
          required
          className="w-40"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.saved && !state.error && (
        <p className="text-sm text-muted-foreground">Saved — this is what registration will use.</p>
      )}

      <Button type="submit" disabled={pending}>
        Save license choice
      </Button>
    </form>
  );
}
