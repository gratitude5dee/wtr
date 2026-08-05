/**
 * Trace job types, plugged into the labeler registry (`src/lib/labels/registry.ts`).
 *
 *   `trace_structural` — tier 1. Deterministic labels from the counts the
 *     BROWSER computed (`spec.structure`). The server never parses a trace.
 *   `trace_judge` — tier 2. Optional LLM quality labels, produced from the
 *     redacted preview (`spec.preview`) and parked as 'awaiting_model' when
 *     no provider is configured.
 *
 * Neither job type can reach a plaintext original: the only inputs are the
 * job spec's counts and the re-redacted preview.
 */
import { TIER2_MODEL } from "../../../config/env";
import { applyTier1Labels } from "../labels/tier1";
import { getJobType, registerJobType, type JobContext } from "../labels/registry";

import {
  judgeRedactedTrace,
  structuralTraceLabels,
  traceJudgeConfigured,
  TraceLabelError,
  validateTraceStructure,
} from "./labels";
import { validateRedactedTrace } from "./redact";
import type { RedactedTrace } from "./redact";
import type { TraceStructure } from "./redact";

export const TRACE_STRUCTURAL_JOB_TYPE = "trace_structural";
export const TRACE_JUDGE_JOB_TYPE = "trace_judge";

/** What an `agenttrace` upload records on its jobs; never any plaintext. */
export interface TraceJobSpec {
  structure: TraceStructure;
  preview: RedactedTrace;
}

function specSection(spec: unknown, key: "structure" | "preview"): unknown {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    throw new TraceLabelError(`trace job spec must be an object with a '${key}'`);
  }
  return (spec as Record<string, unknown>)[key];
}

async function runStructural(context: JobContext): Promise<void> {
  const structure = validateTraceStructure(specSection(context.spec, "structure"));
  await applyTier1Labels(context.assetId, structuralTraceLabels(structure), context.q);
}

async function runJudge(context: JobContext): Promise<void> {
  const preview = validateRedactedTrace(specSection(context.spec, "preview"));
  const labels = await judgeRedactedTrace(preview, context.fetchImpl);
  if (labels.length === 0) throw new TraceLabelError("trace judge produced no usable labels");
  await applyTier1Labels(context.assetId, labels, context.q);
}

/** Idempotent: safe to call from any entrypoint that needs the registry. */
export function registerTraceJobTypes(): void {
  if (!getJobType(TRACE_STRUCTURAL_JOB_TYPE)) {
    registerJobType({
      name: TRACE_STRUCTURAL_JOB_TYPE,
      tier: 1,
      isConfigured: () => true,
      run: runStructural,
    });
  }
  if (!getJobType(TRACE_JUDGE_JOB_TYPE)) {
    registerJobType({
      name: TRACE_JUDGE_JOB_TYPE,
      tier: 2,
      isConfigured: traceJudgeConfigured,
      modelId: () => TIER2_MODEL() || null,
      run: runJudge,
    });
  }
}

registerTraceJobTypes();
