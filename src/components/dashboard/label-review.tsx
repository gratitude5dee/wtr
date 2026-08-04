"use client";

import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetLabelRow } from "@/lib/dashboard/queries";

import {
  confirmLabelAction,
  removeLabelAction,
  setLabelAction,
} from "@/app/(dashboard)/assets/[id]/label-actions";

function labelText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function LabelReview({
  assetId,
  labels,
  editable,
  confirmThreshold = 0.8,
}: {
  assetId: string;
  labels: AssetLabelRow[];
  editable: boolean;
  /** Model labels below this confidence are flagged for confirmation. */
  confirmThreshold?: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No labels yet.</p>
      ) : (
        <ul className="space-y-2">
          {labels.map((label) => {
            const isUnconfirmedModel = label.source === "model" && !label.confirmedByCreator;
            const needsReview =
              isUnconfirmedModel &&
              label.confidence !== null &&
              label.confidence < confirmThreshold;
            return (
              <li key={label.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{label.key}:</span>{" "}
                  {labelText(label.value)}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {needsReview ? (
                    <Badge variant="destructive">needs review</Badge>
                  ) : isUnconfirmedModel ? (
                    <Badge variant="outline">machine-generated</Badge>
                  ) : (
                    <Badge variant="secondary">confirmed by you</Badge>
                  )}
                  {label.confidence !== null && label.source === "model" && (
                    <span className="text-xs text-muted-foreground">
                      {(label.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  {editable && isUnconfirmedModel && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() => confirmLabelAction(assetId, label.id))
                      }
                    >
                      Confirm
                    </Button>
                  )}
                  {editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() => removeLabelAction(assetId, label.id))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <form
          action={(formData) => startTransition(() => setLabelAction(assetId, formData))}
          className="flex flex-wrap items-end gap-2"
        >
          <Input name="key" placeholder="Label (e.g. genre)" className="w-40" required />
          <Input name="value" placeholder="Value (e.g. ambient)" className="w-48" required />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Add / correct label
          </Button>
        </form>
      )}
    </div>
  );
}
