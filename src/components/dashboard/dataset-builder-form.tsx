"use client";

import { useActionState } from "react";

import {
  createDatasetAction,
  type DatasetFormState,
} from "@/app/(dashboard)/datasets/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRESET_NAME } from "@/lib/dashboard/format";

const MODALITIES = ["audio", "image", "video", "threed", "motion"] as const;
/** WTR-NO-TRAIN is deliberately absent: a dataset can never include it. */
const PRESETS = ["WTR-TRAIN-EXCLUSIVE", "WTR-TRAIN-NONEXCLUSIVE"] as const;

export interface DatasetBuilderDefaults {
  modality?: string;
  preset?: string;
  q?: string;
  kyc?: boolean;
}

/**
 * The builder. Filter changes reload the page through the preview form so the
 * match count beside it is always the live count for what would be saved.
 */
export function DatasetBuilderForm({
  defaults,
  matchCount,
}: {
  defaults: DatasetBuilderDefaults;
  matchCount: number;
}) {
  const [state, formAction, pending] = useActionState<DatasetFormState, FormData>(
    createDatasetAction,
    { error: null, message: null },
  );

  return (
    <div className="space-y-5">
      <form method="get" className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="q">Filename contains</Label>
          <Input id="q" name="q" defaultValue={defaults.q ?? ""} placeholder="rain" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modality">Modality</Label>
          <select
            id="modality"
            name="modality"
            defaultValue={defaults.modality ?? ""}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Any</option>
            {MODALITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="preset">License terms</Label>
          <select
            id="preset"
            name="preset"
            defaultValue={defaults.preset ?? ""}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Any training-permitted preset</option>
            {PRESETS.map((value) => (
              <option key={value} value={value}>
                {PRESET_NAME[value] ?? value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Checkbox id="kyc" name="kyc" defaultChecked={defaults.kyc} />
          <Label htmlFor="kyc">KYC-verified creators only</Label>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="outline" size="sm">
            Update preview
          </Button>
          <span className="ml-3 font-mono text-xs text-muted-foreground">
            {matchCount} training-licensed asset{matchCount === 1 ? "" : "s"} match
          </span>
        </div>
      </form>

      <form action={formAction} className="space-y-3 border-t pt-4">
        <input type="hidden" name="modality" value={defaults.modality ?? ""} />
        <input type="hidden" name="preset" value={defaults.preset ?? ""} />
        <input type="hidden" name="q" value={defaults.q ?? ""} />
        {defaults.kyc && <input type="hidden" name="kyc" value="on" />}
        <div className="space-y-1.5">
          <Label htmlFor="name">Dataset name</Label>
          <Input id="name" name="name" placeholder="ambient-audio-v1" required />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending || matchCount === 0}>
          {pending ? "Saving…" : "Save dataset"}
        </Button>
      </form>
    </div>
  );
}
