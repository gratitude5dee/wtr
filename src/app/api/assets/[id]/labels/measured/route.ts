import { NextRequest, NextResponse } from "next/server";

import { getCurrentCreator } from "@/lib/dashboard/queries";
import {
  applyTier1Labels,
  MeasuredLabelError,
  validateMeasuredLabels,
} from "@/lib/labels/tier1";
import { db } from "@/lib/db/pool";
import { log } from "@/lib/log";

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same rule as creator label edits: registration seals labels. */
const EDITABLE_STAGES = ["IN_TRAY", "LABELED"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!ASSET_ID.test(id)) {
    return NextResponse.json({ error: "invalid asset id" }, { status: 400 });
  }
  const creator = await getCurrentCreator();
  if (!creator) {
    return NextResponse.json({ error: "no creator account" }, { status: 401 });
  }

  const owned = await db.query<{ stage: string }>(
    "SELECT stage::text AS stage FROM asset WHERE id = $1 AND creator_id = $2",
    [id, creator.id],
  );
  if (!owned.rows[0]) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
  if (!EDITABLE_STAGES.includes(owned.rows[0].stage)) {
    return NextResponse.json(
      { error: "labels are sealed once the asset is registered" },
      { status: 409 },
    );
  }

  try {
    const payload: unknown = await request.json().catch(() => null);
    const labels = validateMeasuredLabels(payload);
    await applyTier1Labels(id, labels);
    return NextResponse.json({ applied: labels.map((label) => label.key) });
  } catch (error) {
    if (error instanceof MeasuredLabelError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.error("measured labels failed", { assetId: id, error: (error as Error).message });
    return NextResponse.json({ error: "could not record measurements" }, { status: 500 });
  }
}
