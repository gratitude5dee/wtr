"use client";

import { useActionState, useState } from "react";

import {
  bulkApplyAction,
  type BulkActionState,
} from "@/app/(dashboard)/assets/bulk-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRESET_NAME } from "@/lib/dashboard/format";

const PRESETS = ["WTR-TRAIN-EXCLUSIVE", "WTR-TRAIN-NONEXCLUSIVE", "WTR-NO-TRAIN"] as const;

export interface BulkActionAsset {
  id: string;
  filename: string | null;
  stage: string;
}

/**
 * Batch license + label editing for an agent/manager acting on their roster.
 * Only assets whose labels are still editable are offered.
 */
export function BulkActions({ assets }: { assets: BulkActionAsset[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState<BulkActionState, FormData>(
    bulkApplyAction,
    { error: null, message: null },
  );

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="space-y-3" data-tour="assets-bulk-actions">
      <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide bulk actions" : "Bulk actions"}
      </Button>

      {open && (
        <Card>
          <CardContent className="pt-5">
            {assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing editable — labels and license terms are sealed once an asset is
                registered.
              </p>
            ) : (
              <form action={formAction} className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Assets</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        selected.length === assets.length
                          ? []
                          : assets.map((asset) => asset.id),
                      )
                    }
                  >
                    {selected.length === assets.length ? "Clear" : "Select all"}
                  </Button>
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {assets.map((asset) => (
                    <label key={asset.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="assetId"
                        value={asset.id}
                        checked={selected.includes(asset.id)}
                        onChange={() => toggle(asset.id)}
                      />
                      <span className="truncate">
                        {asset.filename ?? asset.id.slice(0, 8)}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bulk-preset">License preset</Label>
                    <select
                      id="bulk-preset"
                      name="licensePreset"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      defaultValue=""
                    >
                      <option value="">leave unchanged</option>
                      {PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {PRESET_NAME[preset] ?? preset}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulk-price">Ask price (IP)</Label>
                    <Input id="bulk-price" name="askPriceIp" inputMode="decimal" placeholder="18" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulk-label-key">Label key</Label>
                    <Input id="bulk-label-key" name="labelKey" placeholder="collection" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulk-label-value">Label value</Label>
                    <Input id="bulk-label-value" name="labelValue" placeholder="spring session" />
                  </div>
                </div>

                {state.error && <p className="text-destructive">{state.error}</p>}
                {state.message && <p className="text-muted-foreground">{state.message}</p>}

                <Button type="submit" size="sm" disabled={pending || selected.length === 0}>
                  {pending ? "Applying…" : `Apply to ${selected.length}`}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
