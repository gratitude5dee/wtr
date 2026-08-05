"use client";

import { useActionState } from "react";

import {
  takeSnapshotAction,
  type DatasetFormState,
} from "@/app/(dashboard)/datasets/actions";
import { Button } from "@/components/ui/button";

/** Freezes the dataset's current membership. Snapshots are immutable once taken. */
export function DatasetSnapshotForm({ datasetId }: { datasetId: string }) {
  const [state, formAction, pending] = useActionState<DatasetFormState, FormData>(
    takeSnapshotAction,
    { error: null, message: null },
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="datasetId" value={datasetId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Freezing…" : "Take snapshot"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
    </form>
  );
}
