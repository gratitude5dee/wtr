/**
 * Browser side of an `agenttrace` upload. The trace is parsed, measured and
 * redacted ON THE DEVICE; only the counts and the redacted preview are POSTed.
 * The plaintext trace goes the same way every other original does — encrypted,
 * never readable by WTR.
 */
import { withBasePath } from "../base-path";

import { MAX_BYTES, parseTrace, TraceParseError } from "./parse";
import { redactTrace, traceStructure } from "./redact";
import type { TraceJobSpec } from "./job-types";

/** Parses a trace file and derives everything the server is allowed to see. */
export async function buildTraceSpec(file: File): Promise<TraceJobSpec> {
  // Checked before reading: `file.text()` would otherwise materialise the whole
  // export (in UTF-16) just to have `parseTrace` reject it, and bulk upload
  // runs several of these at once.
  if (file.size > MAX_BYTES) throw new TraceParseError("trace is larger than 8MB");
  const trace = parseTrace(await file.text());
  return { structure: traceStructure(trace), preview: redactTrace(trace) };
}

/** Best-effort: a failed trace analysis must never fail the upload. */
export async function submitTraceSpec(assetId: string, spec: TraceJobSpec): Promise<void> {
  await fetch(withBasePath(`/api/assets/${assetId}/trace`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  }).catch(() => undefined);
}
