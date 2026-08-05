"use client";

import { useActionState, useState } from "react";

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

interface FilterState {
  modality: string;
  preset: string;
  q: string;
  kyc: boolean;
}

function stateOf(defaults: DatasetBuilderDefaults): FilterState {
  return {
    modality: defaults.modality ?? "",
    preset: defaults.preset ?? "",
    q: defaults.q ?? "",
    kyc: defaults.kyc ?? false,
  };
}

/**
 * The builder. The match count comes from the server, so the filters are only
 * saveable once they have been previewed — editing a control without pressing
 * "Update preview" disables Save rather than quietly saving a query the count
 * on screen never described.
 */
export function DatasetBuilderForm({
  defaults,
  matchCount,
}: {
  defaults: DatasetBuilderDefaults;
  matchCount: number;
}) {
  const previewed = stateOf(defaults);
  const [filters, setFilters] = useState<FilterState>(previewed);
  const [state, formAction, pending] = useActionState<DatasetFormState, FormData>(
    createDatasetAction,
    { error: null, message: null },
  );
  const dirty =
    filters.modality !== previewed.modality ||
    filters.preset !== previewed.preset ||
    filters.q !== previewed.q ||
    filters.kyc !== previewed.kyc;

  return (
    <div className="space-y-5">
      <form method="get" className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="q">Filename contains</Label>
          <Input
            id="q"
            name="q"
            value={filters.q}
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            placeholder="rain"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modality">Modality</Label>
          <select
            id="modality"
            name="modality"
            value={filters.modality}
            onChange={(event) => setFilters({ ...filters, modality: event.target.value })}
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
            value={filters.preset}
            onChange={(event) => setFilters({ ...filters, preset: event.target.value })}
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
          <Checkbox
            id="kyc"
            name="kyc"
            checked={filters.kyc}
            onCheckedChange={(checked) => setFilters({ ...filters, kyc: checked === true })}
          />
          <Label htmlFor="kyc">KYC-verified creators only</Label>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="outline" size="sm">
            Update preview
          </Button>
          <span className="ml-3 font-mono text-xs text-muted-foreground">
            {dirty
              ? "filters changed — update the preview to see the count"
              : `${matchCount} training-licensed asset${matchCount === 1 ? "" : "s"} match`}
          </span>
        </div>
      </form>

      <form action={formAction} className="space-y-3 border-t pt-4">
        {/* Mirrors the previewed filters, which is exactly what the count above
            describes — never the unpreviewed edits still in the controls. */}
        <input type="hidden" name="modality" value={previewed.modality} />
        <input type="hidden" name="preset" value={previewed.preset} />
        <input type="hidden" name="q" value={previewed.q} />
        {previewed.kyc && <input type="hidden" name="kyc" value="on" />}
        <div className="space-y-1.5">
          <Label htmlFor="name">Dataset name</Label>
          <Input id="name" name="name" placeholder="ambient-audio-v1" required />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending || dirty || matchCount === 0}>
          {pending ? "Saving…" : "Save dataset"}
        </Button>
      </form>
    </div>
  );
}
