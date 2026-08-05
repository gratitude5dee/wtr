import { afterEach, describe, expect, it, vi } from "vitest";

import {
  judgeRedactedTrace,
  modelFamily,
  parseJudgeResponse,
  structuralTraceLabels,
  taskCategory,
  traceJudgeConfigured,
  TRACE_KEYS,
  TraceLabelError,
  validateTraceStructure,
} from "../labels";
import { redactTrace, traceStructure } from "../redact";
import { parseTrace } from "../parse";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure() {
  vi.stubEnv("WTR_TIER2_API_URL", "https://model.example/v1");
  vi.stubEnv("WTR_TIER2_API_KEY", "test-key");
  vi.stubEnv("WTR_TIER2_MODEL", "test-judge-model");
}

const STRUCTURE = {
  format: "codex",
  model: "gpt-4.1",
  turnCount: 3,
  toolCallsCount: 4,
  toolNames: ["bash", "apply_patch"],
  failedToolCalls: 1,
  outcome: "success" as const,
  messageCount: 9,
};

describe("modelFamily", () => {
  it("maps known identifiers and refuses to guess otherwise", () => {
    expect(modelFamily("gpt-4.1-mini")).toBe("gpt");
    expect(modelFamily("codex-mini")).toBe("gpt");
    expect(modelFamily("claude-sonnet-4")).toBe("claude");
    expect(modelFamily("gemini-2.5-pro")).toBe("gemini");
    expect(modelFamily("Hermes-3-Llama-3.1-8B")).toBe("llama");
    expect(modelFamily("some-internal-model")).toBe("other");
    expect(modelFamily(null)).toBe("unknown");
  });
});

describe("taskCategory", () => {
  it("is deterministic and priority-ordered over the tool set", () => {
    expect(taskCategory(["apply_patch", "bash"])).toBe("code_editing");
    expect(taskCategory(["bash"])).toBe("shell_automation");
    expect(taskCategory(["browser_navigate"])).toBe("browser_automation");
    expect(taskCategory(["web_search"])).toBe("research");
    expect(taskCategory(["Read", "Grep"])).toBe("code_reading");
    expect(taskCategory(["do_a_thing"])).toBe("tool_use");
    expect(taskCategory([])).toBe("conversation");
  });
});

describe("structuralTraceLabels", () => {
  it("emits exactly the five structural keys, all inside TRACE_KEYS", () => {
    const labels = structuralTraceLabels(STRUCTURE);
    expect(labels.map((label) => label.key)).toEqual([
      "turn_count",
      "tool_calls_count",
      "model_family",
      "outcome",
      "task_category",
    ]);
    for (const label of labels) {
      expect(TRACE_KEYS.has(label.key)).toBe(true);
      expect(label.namespace).toBe("wtr");
      expect(label.confidence).toBe(1);
    }
    expect(labels[2].value).toBe("gpt");
    expect(labels[4].value).toBe("code_editing");
  });

  it("is deterministic end to end from a real trace", () => {
    const raw = [
      { type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-sonnet-4",
          content: [{ type: "tool_use", name: "Bash", input: {} }],
        },
      },
      { type: "result", subtype: "success" },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const once = structuralTraceLabels(traceStructure(parseTrace(raw)));
    const twice = structuralTraceLabels(traceStructure(parseTrace(raw)));
    expect(once).toEqual(twice);
    expect(once.map((label) => label.value)).toEqual([1, 1, "claude", "success", "shell_automation"]);
  });
});

describe("validateTraceStructure", () => {
  it("accepts a well-formed client payload", () => {
    expect(validateTraceStructure(STRUCTURE)).toEqual(STRUCTURE);
  });

  it("rejects malformed client payloads", () => {
    expect(() => validateTraceStructure(null)).toThrow(TraceLabelError);
    expect(() => validateTraceStructure({ ...STRUCTURE, turnCount: -1 })).toThrow(/turnCount/);
    expect(() => validateTraceStructure({ ...STRUCTURE, turnCount: 1.5 })).toThrow(/turnCount/);
    expect(() => validateTraceStructure({ ...STRUCTURE, toolCallsCount: 10 ** 9 })).toThrow(
      /toolCallsCount/,
    );
    expect(() => validateTraceStructure({ ...STRUCTURE, outcome: "great" })).toThrow(/outcome/);
    expect(() => validateTraceStructure({ ...STRUCTURE, toolNames: "bash" })).toThrow(/toolNames/);
    expect(() => validateTraceStructure({ ...STRUCTURE, toolNames: ["x".repeat(200)] })).toThrow(
      /tool name/,
    );
    expect(() => validateTraceStructure({ ...STRUCTURE, model: 7 })).toThrow(/model/);
    expect(() => validateTraceStructure({ ...STRUCTURE, format: "" })).toThrow(/format/);
  });

  it("rejects an unbounded tool-name list", () => {
    const toolNames = Array.from({ length: 65 }, (_, index) => `tool_${index}`);
    expect(() => validateTraceStructure({ ...STRUCTURE, toolNames })).toThrow(/at most 64/);
  });

  it("accepts anything the parser itself can produce, and clamps the model id", () => {
    const longName = "t".repeat(128);
    const clean = validateTraceStructure({
      ...STRUCTURE,
      toolNames: [longName],
      model: "claude-".concat("x".repeat(400)),
    });
    expect(clean.toolNames).toEqual([longName]);
    expect(clean.model?.length).toBe(128);
    expect(modelFamily(clean.model)).toBe("claude");
  });
});

describe("trace judge", () => {
  it("is unconfigured without a key and model", () => {
    vi.stubEnv("WTR_TIER2_API_KEY", "");
    vi.stubEnv("WTR_TIER2_MODEL", "");
    expect(traceJudgeConfigured()).toBe(false);
    configure();
    expect(traceJudgeConfigured()).toBe(true);
  });

  it("keeps only allowlisted judge keys and clamps confidence", () => {
    const raw = JSON.stringify({
      labels: [
        { key: "judge_task_success", value: "yes", confidence: 0.8 },
        { key: "judge_efficiency", value: "high", confidence: 3 },
        { key: "turn_count", value: "99", confidence: 1 },
        { key: "judge_instruction_following", value: "", confidence: 1 },
        { key: "judge_instruction_following", value: "high", confidence: "very" },
      ],
    });
    const labels = parseJudgeResponse(raw, "m1");
    expect(labels.map((label) => label.key)).toEqual(["judge_task_success", "judge_efficiency"]);
    expect(labels[1].confidence).toBe(1);
    expect(labels[0].modelId).toBe("m1");
  });

  it("rejects junk from the model", () => {
    expect(() => parseJudgeResponse("not json", "m1")).toThrow(/invalid JSON/);
    expect(parseJudgeResponse(JSON.stringify({ nope: 1 }), "m1")).toEqual([]);
  });

  it("sends only the redacted preview to the provider", async () => {
    configure();
    const trace = parseTrace(
      JSON.stringify({
        conversations: [
          { from: "human", value: "deploy using key 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
          { from: "gpt", value: "done" },
        ],
      }),
    );
    const preview = redactTrace(trace);
    let sentBody = "";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return new Response(
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
      );
    });
    const labels = await judgeRedactedTrace(preview, fetchImpl as unknown as typeof fetch);
    expect(labels).toHaveLength(1);
    const body = sentBody;
    expect(body).not.toContain("deadbeef");
    expect(body).toContain("[redacted:hex]");
  });

  it("surfaces a provider error", async () => {
    configure();
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(
      judgeRedactedTrace(redactTrace(parseTrace('{"event":"message","role":"user","content":"hi"}')), fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/status 500/);
  });

  it("surfaces an empty provider response", async () => {
    configure();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(
      judgeRedactedTrace(redactTrace(parseTrace('{"event":"message","role":"user","content":"hi"}')), fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/no content/);
  });
});
