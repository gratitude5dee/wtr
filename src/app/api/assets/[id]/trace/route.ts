import { after, NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/pool";
import { getActingCreator } from "@/lib/dashboard/queries";
import { enqueueJob, runJob } from "@/lib/labels/registry";
import "@/lib/labels/job-types";
import { log } from "@/lib/log";
import { TraceLabelError, validateTraceStructure } from "@/lib/traces/labels";
import {
  RedactionError,
  validateRedactedTrace,
} from "@/lib/traces/redact";
import {
  TRACE_JUDGE_JOB_TYPE,
  TRACE_STRUCTURAL_JOB_TYPE,
} from "@/lib/traces/job-types";

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same rule as the measured-labels route: registration seals labels. */
const EDITABLE_STAGES = ["IN_TRAY", "LABELED"];

/**
 * Records the client-derived structure and redacted preview of an agent
 * trace, then queues the trace labelers. No plaintext trace is accepted here:
 * the body carries counts and an already-redacted excerpt, and the excerpt is
 * re-redacted server-side before it can reach a model.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!ASSET_ID.test(id)) {
    return NextResponse.json({ error: "invalid asset id" }, { status: 400 });
  }
  const creator = await getActingCreator();
  if (!creator) {
    return NextResponse.json({ error: "no creator account" }, { status: 401 });
  }

  const owned = await db.query<{ stage: string; modality: string }>(
    "SELECT stage::text AS stage, modality FROM asset WHERE id = $1 AND creator_id = $2",
    [id, creator.id],
  );
  const asset = owned.rows[0];
  if (!asset) return NextResponse.json({ error: "asset not found" }, { status: 404 });
  if (asset.modality !== "agenttrace") {
    return NextResponse.json({ error: "asset is not an agent trace" }, { status: 409 });
  }
  if (!EDITABLE_STAGES.includes(asset.stage)) {
    return NextResponse.json(
      { error: "labels are sealed once the asset is registered" },
      { status: 409 },
    );
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const section = (key: "structure" | "preview") =>
      typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
    const structure = validateTraceStructure(section("structure"));
    const preview = validateRedactedTrace(section("preview"));
    const structuralState = await enqueueJob(id, TRACE_STRUCTURAL_JOB_TYPE, { structure });
    const judgeState = await enqueueJob(id, TRACE_JUDGE_JOB_TYPE, { preview });
    // Same shape as the preview route: the labelers run after the response, so
    // the upload never blocks on them and a labeler failure is not the
    // creator's problem. A parked 'awaiting_model' job is left for later.
    if (structuralState === "queued") after(() => runJob(id, TRACE_STRUCTURAL_JOB_TYPE));
    if (judgeState === "queued") after(() => runJob(id, TRACE_JUDGE_JOB_TYPE));
    return NextResponse.json({ structural: structuralState, judge: judgeState });
  } catch (error) {
    if (error instanceof TraceLabelError || error instanceof RedactionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.error("trace job enqueue failed", { assetId: id, error: (error as Error).message });
    return NextResponse.json({ error: "could not record the trace" }, { status: 500 });
  }
}
