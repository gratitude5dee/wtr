/**
 * Pushes WTR's active provider policy to Trace
 * (`PUT /webhook/v1/data-audit/provider-policy`). Run after publishing a new
 * ToS/Privacy version so the audit side matches what the UI displays.
 */
import { activeProviderPolicy } from "../src/lib/consent/policy";
import { stableBatchId } from "../src/lib/trace/client";
import { createTraceClient, isTraceMock } from "../src/lib/trace/factory";
import { log } from "../src/lib/log";

async function main(): Promise<void> {
  const policy = await activeProviderPolicy();
  const trace = createTraceClient();
  const batchId = await stableBatchId({
    action: "provider-policy",
    tos: policy.tos.version,
    privacy: policy.privacy.version,
  });
  await trace.pushProviderPolicy({ policy, batchId });
  log.info("provider policy pushed", {
    mock: isTraceMock(),
    tos: policy.tos.version,
    privacy: policy.privacy.version,
  });
}

main().catch((error: Error) => {
  log.error("push-policy failed", { error: error.message });
  process.exit(1);
});
