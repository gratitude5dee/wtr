/**
 * Built-in job types. Importing this module registers the two flows that
 * predate the registry — the deterministic tier-1 labeler and the tier-2
 * vision labeler over the degraded preview — so their behavior is unchanged
 * while new labelers plug in the same way.
 */
import { readPreview } from "../upload/preview-store";
import { registerTraceJobTypes } from "../traces/job-types";

import { registerJobType, getJobType, type JobContext } from "./registry";
import { applyTier1Labels, validateMeasuredLabels } from "./tier1";
import { labelPreviewWithModel, tier2Configured } from "./tier2";
import { TIER2_MODEL } from "../../../config/env";

export const TIER1_JOB_TYPE = "tier1_intrinsic";
export const TIER2_JOB_TYPE = "tier2_vision";

/**
 * Client-measured intrinsics carried in `spec`. The browser measures them
 * because the plaintext original never reaches WTR servers.
 */
async function runTier1(context: JobContext): Promise<void> {
  const labels = validateMeasuredLabels(context.spec);
  await applyTier1Labels(context.assetId, labels, context.q);
}

async function runTier2(context: JobContext): Promise<void> {
  const preview = await readPreview(context.assetId);
  if (!preview) throw new Error("no degraded preview available to label");
  const labels = await labelPreviewWithModel(preview.bytes, context.fetchImpl);
  await applyTier1Labels(context.assetId, labels, context.q);
}

/** Idempotent: safe to call from any entrypoint that needs the registry. */
export function registerBuiltInJobTypes(): void {
  if (!getJobType(TIER1_JOB_TYPE)) {
    registerJobType({
      name: TIER1_JOB_TYPE,
      tier: 1,
      isConfigured: () => true,
      run: runTier1,
    });
  }
  if (!getJobType(TIER2_JOB_TYPE)) {
    registerJobType({
      name: TIER2_JOB_TYPE,
      tier: 2,
      isConfigured: tier2Configured,
      modelId: () => TIER2_MODEL() || null,
      run: runTier2,
    });
  }
  // Agent-trace labelers live with the trace code but belong to the same queue.
  registerTraceJobTypes();
}

registerBuiltInJobTypes();
