/**
 * Builds the process-wide Trace client from environment configuration.
 *
 * `live` speaks to the real DATA Foundation staging/production API with the
 * provisioned provider key. `mock` (the default while WTR is on the provider
 * waitlist and holds no key) routes the exact same client and wire format
 * through an in-process simulator — see `mock.ts` — so the pipeline can be
 * demonstrated end-to-end without ever pretending a real registration
 * happened.
 */
import { TRACE_API_KEY, TRACE_BASE_URL, TRACE_MODE, TRACE_PROVIDER } from "../../../config/env";
import { log } from "../log";

import { TraceClient } from "./client";
import { createMockTraceFetch } from "./mock";

/** One mock transport per process, so `data_id`s stay consistent across calls. */
let mockFetch: typeof fetch | null = null;

export function isTraceMock(): boolean {
  return TRACE_MODE() === "mock";
}

export function createTraceClient(): TraceClient {
  if (TRACE_MODE() === "live") {
    return new TraceClient({
      baseUrl: TRACE_BASE_URL(),
      apiKey: TRACE_API_KEY(),
      provider: TRACE_PROVIDER(),
    });
  }

  log.warn(
    "TRACE MOCK MODE: no provider API key configured — Trace calls are simulated " +
      "in-process and no real audit records are created",
  );
  mockFetch ??= createMockTraceFetch();
  return new TraceClient({
    baseUrl: TRACE_BASE_URL(),
    apiKey: "mock-no-key",
    provider: TRACE_PROVIDER(),
    fetchImpl: mockFetch,
  });
}
