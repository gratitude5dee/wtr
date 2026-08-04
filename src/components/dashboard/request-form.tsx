"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRESET_NAME, PRESET_SENTENCE } from "@/lib/dashboard/format";

import {
  createRequestAction,
  type NewRequestState,
} from "@/app/(dashboard)/requests/new/actions";

const MODALITIES = ["any", "audio", "image", "video", "3d", "motion"] as const;
const PRESETS = ["WTR-TRAIN-EXCLUSIVE", "WTR-TRAIN-NONEXCLUSIVE", "WTR-NO-TRAIN"] as const;

export function RequestForm() {
  const [state, formAction, pending] = useActionState<NewRequestState, FormData>(
    createRequestAction,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4 text-sm">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Field recordings of urban rain, 48kHz+"
          maxLength={200}
          required
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Modality</legend>
        <div className="flex flex-wrap gap-3">
          {MODALITIES.map((modality) => (
            <label key={modality} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="modality"
                value={modality}
                defaultChecked={modality === "any"}
              />
              {modality}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">License terms you need</legend>
        <div className="space-y-2">
          {PRESETS.map((preset) => (
            <label key={preset} className="flex items-start gap-2">
              <input
                type="radio"
                name="licensePreset"
                value={preset}
                defaultChecked={preset === "WTR-TRAIN-NONEXCLUSIVE"}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{PRESET_NAME[preset] ?? preset}</span>
                <span className="block text-muted-foreground">
                  {PRESET_SENTENCE[preset] ?? ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budget">Total budget (IP)</Label>
          <Input id="budget" name="budget" placeholder="25" inputMode="decimal" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitPrice">Per-item price (IP, optional)</Label>
          <Input id="unitPrice" name="unitPrice" placeholder="0.5" inputMode="decimal" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="deadline">Deadline (optional)</Label>
        <Input id="deadline" name="deadline" type="datetime-local" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Brief</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          placeholder="What you need, quality bar, what gets accepted…"
        />
      </div>

      <label className="flex items-center gap-2">
        <Checkbox name="kycRequired" />
        Only accept KYC-verified creators
      </label>

      {state.error && <p className="text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post request"}
      </Button>
    </form>
  );
}
