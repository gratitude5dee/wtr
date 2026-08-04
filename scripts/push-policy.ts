/**
 * Pushes WTR's active provider policy to Trace
 * (`PUT /webhook/v1/data-audit/provider-policy`). Run after publishing a new
 * ToS/Privacy version so the audit side matches what the UI displays.
 */
import { TRACE_API_KEY, TRACE_BASE_URL, TRACE_PROVIDER } from "../config/env";
import { activeProviderPolicy } from "../src/lib/consent/policy";
import { stableBatchId, TraceClient } from "../src/lib/trace/client";
import { log } from "../src/lib/log";

async function main(): Promise<void> {
  const policy = await activeProviderPolicy();
  const trace = new TraceClient({
    baseUrl: TRACE_BASE_URL(),
    apiKey: TRACE_API_KEY(),
    provider: TRACE_PROVIDER(),
  });
  const batchId = await stableBatchId({
    action: "provider-policy",
    tos: policy.tos.version,
    privacy: policy.privacy.version,
  });
  await trace.pushProviderPolicy({ policy, batchId });
  log.info("provider policy pushed", {
    tos: policy.tos.version,
    privacy: policy.privacy.version,
  });
}

main().catch((error: Error) => {
  log.error("push-policy failed", { error: error.message });
  process.exit(1);
});
