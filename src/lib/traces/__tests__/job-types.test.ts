import { afterEach, describe, expect, it, vi } from "vitest";

import type { Queryable } from "../../db/pool";
import { enqueueJob, requireJobType, runJob } from "../../labels/registry";
import { parseTrace } from "../parse";
import { redactTrace, traceStructure } from "../redact";
import {
  registerTraceJobTypes,
  TRACE_JUDGE_JOB_TYPE,
  TRACE_STRUCTURAL_JOB_TYPE,
  type TraceJobSpec,
} from "../job-types";

registerTraceJobTypes();

afterEach(() => {
  vi.unstubAllEnvs();
});

interface Call {
  sql: string;
  params: readonly unknown[];
}

/** Scripted Queryable: the claim UPDATE returns one row carrying the spec. */
function fakeDb(spec: unknown): { q: Queryable; calls: Call[] } {
  const calls: Call[] = [];
  const q: Queryable = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      const rows = sql.includes("state = 'running'") ? [{ id: "job-1", spec }] : [];
      return { rows: rows as never[], rowCount: rows.length };
    },
  };
  return { q, calls };
}

const TRACE = [
  { type: "user", message: { role: "user", content: [{ type: "text", text: "ship it" }] } },
  {
    type: "assistant",
    message: {
      role: "assistant",
      model: "claude-sonnet-4",
      content: [{ type: "tool_use", name: "apply_patch", input: {} }],
    },
  },
  { type: "result", subtype: "success" },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

function spec(): TraceJobSpec {
  const trace = parseTrace(TRACE);
  return { structure: traceStructure(trace), preview: redactTrace(trace) };
}

function labelInserts(calls: readonly Call[]) {
  return calls
    .filter((call) => call.sql.includes("INSERT INTO asset_label"))
    .map((call) => ({ key: call.params[2], value: JSON.parse(String(call.params[3])) }));
}

describe("trace job types", () => {
  it("registers both labelers idempotently", () => {
    registerTraceJobTypes();
    expect(requireJobType(TRACE_STRUCTURAL_JOB_TYPE).tier).toBe(1);
    expect(requireJobType(TRACE_JUDGE_JOB_TYPE).tier).toBe(2);
    expect(requireJobType(TRACE_STRUCTURAL_JOB_TYPE).isConfigured()).toBe(true);
  });

  it("writes the structural labels from the client-computed spec", async () => {
    const { q, calls } = fakeDb({ structure: spec().structure });
    await runJob("asset-1", TRACE_STRUCTURAL_JOB_TYPE, { q });
    expect(labelInserts(calls)).toEqual([
      { key: "turn_count", value: 1 },
      { key: "tool_calls_count", value: 1 },
      { key: "model_family", value: "claude" },
      { key: "outcome", value: "success" },
      { key: "task_category", value: "code_editing" },
    ]);
    expect(calls.at(-1)?.params).toContain("done");
  });

  it("fails the job when the spec has no structure", async () => {
    const { q, calls } = fakeDb({ nope: true });
    await runJob("asset-1", TRACE_STRUCTURAL_JOB_TYPE, { q });
    expect(labelInserts(calls)).toEqual([]);
    expect(calls.at(-1)?.params).toContain("failed");
  });

  it("fails the job when the client counts are impossible", async () => {
    const { q, calls } = fakeDb({ structure: { ...spec().structure, turnCount: -3 } });
    await runJob("asset-1", TRACE_STRUCTURAL_JOB_TYPE, { q });
    expect(labelInserts(calls)).toEqual([]);
    expect(String(calls.at(-1)?.params[2])).toMatch(/turnCount/);
  });

  it("parks the judge as awaiting_model when no provider is configured", async () => {
    vi.stubEnv("WTR_TIER2_API_KEY", "");
    vi.stubEnv("WTR_TIER2_MODEL", "");
    const { q } = fakeDb(null);
    await expect(enqueueJob("asset-1", TRACE_JUDGE_JOB_TYPE, { preview: spec().preview }, q)).resolves.toBe(
      "awaiting_model",
    );
  });

  it("labels from the redacted preview when the judge is configured", async () => {
    vi.stubEnv("WTR_TIER2_API_URL", "https://model.example/v1");
    vi.stubEnv("WTR_TIER2_API_KEY", "test-key");
    vi.stubEnv("WTR_TIER2_MODEL", "test-judge-model");
    const { q, calls } = fakeDb({ preview: spec().preview });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  labels: [{ key: "judge_task_success", value: "yes", confidence: 0.9 }],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await runJob("asset-1", TRACE_JUDGE_JOB_TYPE, { q, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(labelInserts(calls)).toEqual([{ key: "judge_task_success", value: "yes" }]);
    expect(calls.at(-1)?.params).toContain("done");
  });

  it("fails the judge job when the model returns junk", async () => {
    vi.stubEnv("WTR_TIER2_API_URL", "https://model.example/v1");
    vi.stubEnv("WTR_TIER2_API_KEY", "test-key");
    vi.stubEnv("WTR_TIER2_MODEL", "test-judge-model");
    const { q, calls } = fakeDb({ preview: spec().preview });
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }),
    );
    await runJob("asset-1", TRACE_JUDGE_JOB_TYPE, { q, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(labelInserts(calls)).toEqual([]);
    expect(String(calls.at(-1)?.params[2])).toMatch(/no usable labels/);
  });
});
