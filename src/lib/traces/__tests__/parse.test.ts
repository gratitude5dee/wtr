import { describe, expect, it } from "vitest";

import { detectTraceFormat, parseTrace, TraceParseError } from "../parse";

const HERMES = JSON.stringify({
  model: "Hermes-3-Llama-3.1-8B",
  outcome: "success",
  conversations: [
    { from: "system", value: "You are a helpful agent." },
    { from: "human", value: "What is the weather in Paris?" },
    {
      from: "gpt",
      value: '<tool_call>{"name": "get_weather", "arguments": {"city": "Paris"}}</tool_call>',
    },
    { from: "tool", value: '{"temp_c": 21}' },
    { from: "gpt", value: "It is 21°C in Paris." },
  ],
});

const OPENCLAW = [
  { event: "run_start", model: "gpt-4.1-mini" },
  { event: "message", role: "user", content: "Fix the failing test." },
  { event: "message", role: "assistant", content: "Looking at the suite." },
  { event: "tool_call", tool: "bash", args: { cmd: "npm test" } },
  { event: "tool_result", status: "ok", content: "1 failing" },
  { event: "message", role: "assistant", content: "Patched it." },
  { event: "run_end", status: "success" },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const CODEX = [
  { type: "turn_context", payload: { type: "turn_context", model: "codex-mini" } },
  { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Rename the helper." }] } },
  { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "On it." }] } },
  { type: "response_item", payload: { type: "function_call", name: "apply_patch" } },
  { type: "response_item", payload: { type: "function_call_output", output: { success: false, content: "patch failed" } } },
  { type: "response_item", payload: { type: "task_complete", status: "failure" } },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const CLAUDE_CODE = [
  { type: "user", message: { role: "user", content: [{ type: "text", text: "Summarize the repo." }] } },
  {
    type: "assistant",
    message: {
      role: "assistant",
      model: "claude-sonnet-4",
      content: [
        { type: "text", text: "Reading files." },
        { type: "tool_use", name: "Read", input: { path: "README.md" } },
      ],
    },
  },
  { type: "user", message: { role: "user", content: [{ type: "tool_result", is_error: false, content: "# WTR" }] } },
  { type: "result", subtype: "success", is_error: false },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("detectTraceFormat", () => {
  it("names each supported export", () => {
    expect(detectTraceFormat(HERMES)).toBe("hermes");
    expect(detectTraceFormat(OPENCLAW)).toBe("openclaw");
    expect(detectTraceFormat(CODEX)).toBe("codex");
    expect(detectTraceFormat(CLAUDE_CODE)).toBe("claude_code");
  });

  it("rejects an unrecognized shape", () => {
    expect(() => detectTraceFormat(JSON.stringify({ hello: "world" }))).toThrow(TraceParseError);
    expect(() => detectTraceFormat(JSON.stringify({ hello: "world" }))).toThrow(/unrecognized/);
  });

  it("rejects empty input", () => {
    expect(() => detectTraceFormat("   \n ")).toThrow(/empty/);
  });
});

describe("parseTrace", () => {
  it("normalizes a Hermes conversation", () => {
    const trace = parseTrace(HERMES);
    expect(trace.format).toBe("hermes");
    expect(trace.model).toBe("Hermes-3-Llama-3.1-8B");
    expect(trace.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(trace.turnCount).toBe(2);
    expect(trace.toolCallsCount).toBe(1);
    expect(trace.messages[2].toolCalls[0].name).toBe("get_weather");
    expect(trace.outcome).toBe("success");
  });

  it("normalizes an OpenClaw event log", () => {
    const trace = parseTrace(OPENCLAW);
    expect(trace.format).toBe("openclaw");
    expect(trace.model).toBe("gpt-4.1-mini");
    expect(trace.turnCount).toBe(2);
    expect(trace.toolCallsCount).toBe(1);
    expect(trace.messages.find((m) => m.toolCalls.length > 0)?.toolCalls[0]).toEqual({
      name: "bash",
      ok: true,
    });
    expect(trace.outcome).toBe("success");
  });

  it("normalizes a Codex rollout including a failed tool call", () => {
    const trace = parseTrace(CODEX);
    expect(trace.format).toBe("codex");
    expect(trace.model).toBe("codex-mini");
    expect(trace.toolCallsCount).toBe(1);
    expect(trace.messages.flatMap((m) => m.toolCalls)[0]).toEqual({ name: "apply_patch", ok: false });
    expect(trace.outcome).toBe("failure");
  });

  it("normalizes a Claude Code session log", () => {
    const trace = parseTrace(CLAUDE_CODE);
    expect(trace.format).toBe("claude_code");
    expect(trace.model).toBe("claude-sonnet-4");
    expect(trace.turnCount).toBe(1);
    expect(trace.toolCallsCount).toBe(1);
    expect(trace.messages.flatMap((m) => m.toolCalls)[0]).toEqual({ name: "Read", ok: true });
    expect(trace.outcome).toBe("success");
  });

  it("rejects a truncated JSONL export naming the line", () => {
    const truncated = `${OPENCLAW.split("\n").slice(0, 3).join("\n")}\n{"event": "message", "role`;
    expect(() => parseTrace(truncated)).toThrow(TraceParseError);
    expect(() => parseTrace(truncated)).toThrow(/line 4/);
  });

  it("rejects a file that mixes exports rather than dropping foreign records", () => {
    const mixed = [CLAUDE_CODE, OPENCLAW, CODEX].join("\n");
    expect(() => parseTrace(mixed)).toThrow(TraceParseError);
    expect(() => parseTrace(mixed)).toThrow(/mixes formats/);
  });

  it("names the real file line when rejecting a mixed export", () => {
    const mixed = ["", CLAUDE_CODE, "", CODEX].join("\n");
    const codexLine = mixed.split("\n").findIndex((line) => line.includes("turn_context")) + 1;
    expect(() => parseTrace(mixed)).toThrow(new RegExp(`line ${codexLine} looks like codex`));
  });

  it("accepts a single-tool export whose records carry an extra marker-shaped field", () => {
    const openclaw = [
      { event: "message", role: "user", content: "run the suite" },
      { event: "tool_call", tool: "bash", payload: { cmd: "npm test" } },
      { event: "message", role: "assistant", content: "green" },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    expect(parseTrace(openclaw).format).toBe("openclaw");
  });

  it("rejects a JSONL line that is not an object", () => {
    expect(() => parseTrace('{"event":"message","role":"user","content":"hi"}\n"bare string"')).toThrow(
      /line 2 is not a JSON object/,
    );
  });

  it("rejects an oversized export", () => {
    expect(() => parseTrace("x".repeat(9 * 1024 * 1024))).toThrow(/larger than 8MB/);
  });

  it("rejects a Hermes turn with an unknown role", () => {
    const bad = JSON.stringify({ conversations: [{ from: "wizard", value: "hi" }] });
    expect(() => parseTrace(bad)).toThrow(TraceParseError);
  });

  it("rejects a Hermes tool_call block that is not JSON", () => {
    const bad = JSON.stringify({
      conversations: [{ from: "gpt", value: "<tool_call>not json</tool_call>" }],
    });
    expect(() => parseTrace(bad)).toThrow(/tool_call/);
  });

  it("rejects an OpenClaw tool_call without a tool name", () => {
    const bad = '{"event":"message","role":"assistant","content":"hi"}\n{"event":"tool_call"}';
    expect(() => parseTrace(bad)).toThrow(/tool name/);
  });

  it("rejects a trace that carries no messages", () => {
    expect(() => parseTrace('{"event":"run_end","status":"success"}')).toThrow(/no messages/);
  });

  it("treats an unknown outcome as unknown rather than guessing", () => {
    const trace = parseTrace(
      '{"event":"message","role":"assistant","content":"done"}\n{"event":"run_end","status":"weird"}',
    );
    expect(trace.outcome).toBe("unknown");
  });
});
