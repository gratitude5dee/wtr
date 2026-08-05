/**
 * Agent-trace parsing (modality `agenttrace`).
 *
 * Four trace exports are accepted — Hermes (ShareGPT-style function-calling
 * conversations), OpenClaw event logs, Codex rollouts and Claude Code session
 * logs — and all four normalize into ONE canonical shape so every downstream
 * consumer (structural labeler, redactor, judge) speaks a single schema.
 *
 * This module is isomorphic on purpose: it runs in the browser, where the
 * plaintext trace lives. Plaintext traces never reach WTR servers — only the
 * derived counts and the redacted preview do (see `redact.ts`).
 *
 * Validation is strict. Anything ambiguous, malformed, truncated or oversized
 * throws `TraceParseError` with a message safe to show the uploader; callers
 * never receive a half-parsed trace.
 */

export type TraceFormat = "hermes" | "openclaw" | "codex" | "claude_code";

export type TraceRole = "system" | "user" | "assistant" | "tool";

export type TraceOutcome = "success" | "failure" | "unknown";

export interface CanonicalToolCall {
  /** Tool name as the agent invoked it. */
  name: string;
  /** Whether the corresponding result reported an error; null when unknown. */
  ok: boolean | null;
}

export interface CanonicalMessage {
  role: TraceRole;
  /** Plaintext. Never sent to a server — redact first. */
  text: string;
  toolCalls: CanonicalToolCall[];
}

export interface CanonicalTrace {
  format: TraceFormat;
  /** Model identifier when the export records one. */
  model: string | null;
  messages: CanonicalMessage[];
  /** Assistant responses: one per model turn. */
  turnCount: number;
  toolCallsCount: number;
  outcome: TraceOutcome;
}

/** Malformed or unsupported input. Safe to echo to the uploader. */
export class TraceParseError extends Error {}

/** A trace export past this size is not a hand-authored agent session. */
export const MAX_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGES = 20_000;
/** Per-message plaintext we keep; longer bodies are cut before any redaction. */
const MAX_TEXT_CHARS = 100_000;
/** Shared with the server-side validator so the two never disagree. */
export const MAX_TOOL_NAME_CHARS = 128;
/** Model identifiers are clamped rather than rejected: they are cosmetic. */
export const MAX_MODEL_CHARS = 128;

const ROLE_ALIASES: Record<string, TraceRole> = {
  system: "system",
  user: "user",
  human: "user",
  assistant: "assistant",
  gpt: "assistant",
  model: "assistant",
  tool: "tool",
  function: "tool",
  observation: "tool",
  tool_result: "tool",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeRole(value: unknown): TraceRole | null {
  if (typeof value !== "string") return null;
  return ROLE_ALIASES[value.toLowerCase()] ?? null;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.slice(0, MAX_TEXT_CHARS);
  if (Array.isArray(value)) {
    // Anthropic/OpenAI content blocks: keep the textual parts only.
    return value
      .map((block) => {
        const record = asRecord(block);
        if (!record) return typeof block === "string" ? block : "";
        return typeof record.text === "string" ? record.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_TEXT_CHARS);
  }
  return "";
}

function toolName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > MAX_TOOL_NAME_CHARS) return null;
  return name;
}

/** JSONL reader: every non-blank line must be a complete JSON object. */
function parseLines(raw: string): Record<string, unknown>[] {
  const lines = raw.split("\n");
  const records: Record<string, unknown>[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new TraceParseError(`malformed JSON on line ${index + 1} — the trace may be truncated`);
    }
    const record = asRecord(parsed);
    if (!record) {
      throw new TraceParseError(`line ${index + 1} is not a JSON object`);
    }
    records.push(record);
    if (records.length > MAX_MESSAGES) {
      throw new TraceParseError(`trace has more than ${MAX_MESSAGES} records`);
    }
  }
  if (records.length === 0) throw new TraceParseError("trace contains no records");
  return records;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function isHermes(document: unknown): boolean {
  const record = asRecord(document);
  const turns = record?.conversations;
  if (!Array.isArray(turns) || turns.length === 0) return false;
  return turns.every((turn) => {
    const item = asRecord(turn);
    return item !== null && typeof item.from === "string" && "value" in item;
  });
}

function isClaudeCode(records: readonly Record<string, unknown>[]): boolean {
  return records.some(
    (record) => typeof record.type === "string" && asRecord(record.message) !== null,
  );
}

function isCodex(records: readonly Record<string, unknown>[]): boolean {
  return records.some(
    (record) => typeof record.type === "string" && asRecord(record.payload) !== null,
  );
}

function isOpenClaw(records: readonly Record<string, unknown>[]): boolean {
  return records.some((record) => typeof record.event === "string");
}

/**
 * Names the export format. `.json` documents can only be Hermes; JSONL is
 * disambiguated by the marker key each tool writes (`message`, `payload`,
 * `event`). Ambiguity is an error rather than a guess.
 */
export function detectTraceFormat(raw: string): TraceFormat {
  if (raw.trim().length === 0) throw new TraceParseError("trace is empty");
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    let document: unknown;
    try {
      document = JSON.parse(trimmed);
    } catch {
      document = null;
    }
    if (document !== null && isHermes(document)) return "hermes";
  }
  const records = parseLines(raw);
  if (isClaudeCode(records)) return "claude_code";
  if (isCodex(records)) return "codex";
  if (isOpenClaw(records)) return "openclaw";
  if (isHermes(records[0])) return "hermes";
  throw new TraceParseError("unrecognized trace format");
}

// ---------------------------------------------------------------------------
// Per-format normalizers
// ---------------------------------------------------------------------------

/**
 * Hermes: `{ "model"?, "conversations": [{ "from": "human"|"gpt"|"tool",
 * "value": string, "tool_calls"?: [{ "name" }] }] }`. Tool calls may also be
 * embedded as a `<tool_call>{"name":...}</tool_call>` block in an assistant
 * turn, which is how the Hermes function-calling datasets encode them.
 */
const HERMES_TOOL_CALL = /<tool_call>\s*([\s\S]*?)<\/tool_call>/g;

function fromHermes(raw: string): CanonicalTrace {
  let document: unknown;
  try {
    document = JSON.parse(raw.trim());
  } catch {
    document = parseLines(raw)[0];
  }
  const record = asRecord(document);
  const turns = record?.conversations;
  if (!record || !Array.isArray(turns)) throw new TraceParseError("hermes trace has no conversations");
  const messages: CanonicalMessage[] = [];
  for (const turn of turns) {
    const item = asRecord(turn);
    if (!item) throw new TraceParseError("hermes conversation turn is not an object");
    const role = normalizeRole(item.from);
    if (!role) throw new TraceParseError(`hermes turn has an unknown 'from' value`);
    const body = text(item.value);
    const toolCalls: CanonicalToolCall[] = [];
    for (const declared of Array.isArray(item.tool_calls) ? item.tool_calls : []) {
      const call = asRecord(declared);
      const name = toolName(call?.name ?? asRecord(call?.function)?.name);
      if (name) toolCalls.push({ name, ok: null });
    }
    for (const match of body.matchAll(HERMES_TOOL_CALL)) {
      let embedded: unknown;
      try {
        embedded = JSON.parse(match[1].trim());
      } catch {
        throw new TraceParseError("hermes <tool_call> block is not valid JSON");
      }
      const name = toolName(asRecord(embedded)?.name);
      if (name) toolCalls.push({ name, ok: null });
    }
    messages.push({ role, text: body, toolCalls });
  }
  return finalize("hermes", typeof record.model === "string" ? record.model : null, messages, outcomeOf(record.outcome));
}

/**
 * OpenClaw: JSONL events `{ "event": "message"|"tool_call"|"tool_result"|"run_end",
 * "role"?, "content"?, "tool"?, "error"?, "status"? }`.
 */
function fromOpenClaw(records: readonly Record<string, unknown>[]): CanonicalTrace {
  const messages: CanonicalMessage[] = [];
  let model: string | null = null;
  let outcome: TraceOutcome = "unknown";
  for (const record of records) {
    if (typeof record.model === "string" && !model) model = record.model;
    switch (record.event) {
      case "message": {
        const role = normalizeRole(record.role);
        if (!role) throw new TraceParseError("openclaw message event has no usable role");
        messages.push({ role, text: text(record.content), toolCalls: [] });
        break;
      }
      case "tool_call": {
        const name = toolName(record.tool ?? record.name);
        if (!name) throw new TraceParseError("openclaw tool_call event has no tool name");
        attachToolCall(messages, { name, ok: null });
        break;
      }
      case "tool_result": {
        const ok = record.error ? false : record.status === undefined ? true : record.status === "ok";
        markLastToolCall(messages, ok);
        messages.push({ role: "tool", text: text(record.content), toolCalls: [] });
        break;
      }
      case "run_end": {
        outcome = outcomeOf(record.status ?? record.outcome);
        break;
      }
      default:
        break; // Unknown event kinds are ignored, not fatal: exports evolve.
    }
  }
  return finalize("openclaw", model, messages, outcome);
}

/**
 * Codex rollout: JSONL `{ "type": "response_item"|"turn_context",
 * "payload": { "type": "message"|"function_call"|"function_call_output", ... } }`.
 */
function fromCodex(records: readonly Record<string, unknown>[]): CanonicalTrace {
  const messages: CanonicalMessage[] = [];
  let model: string | null = null;
  let outcome: TraceOutcome = "unknown";
  for (const record of records) {
    const payload = asRecord(record.payload);
    if (!payload) continue;
    if (typeof payload.model === "string" && !model) model = payload.model;
    switch (payload.type) {
      case "message": {
        const role = normalizeRole(payload.role);
        if (!role) throw new TraceParseError("codex message has no usable role");
        messages.push({ role, text: text(payload.content), toolCalls: [] });
        break;
      }
      case "function_call": {
        const name = toolName(payload.name);
        if (!name) throw new TraceParseError("codex function_call has no name");
        attachToolCall(messages, { name, ok: null });
        break;
      }
      case "function_call_output": {
        const output = asRecord(payload.output);
        const ok = output ? output.success !== false : true;
        markLastToolCall(messages, ok);
        messages.push({ role: "tool", text: text(output?.content ?? payload.output), toolCalls: [] });
        break;
      }
      case "task_complete": {
        outcome = outcomeOf(payload.status ?? "success");
        break;
      }
      default:
        break;
    }
  }
  return finalize("codex", model, messages, outcome);
}

/**
 * Claude Code session log: JSONL `{ "type": "user"|"assistant"|"result",
 * "message": { "role", "model"?, "content": [blocks] }, "is_error"?, "subtype"? }`
 * with `tool_use` / `tool_result` content blocks.
 */
function fromClaudeCode(records: readonly Record<string, unknown>[]): CanonicalTrace {
  const messages: CanonicalMessage[] = [];
  let model: string | null = null;
  let outcome: TraceOutcome = "unknown";
  for (const record of records) {
    if (record.type === "result") {
      outcome = record.is_error === true ? "failure" : outcomeOf(record.subtype ?? "success");
      continue;
    }
    const message = asRecord(record.message);
    if (!message) continue;
    if (typeof message.model === "string" && !model) model = message.model;
    const role = normalizeRole(message.role ?? record.type);
    if (!role) throw new TraceParseError("claude code entry has no usable role");
    const blocks = Array.isArray(message.content) ? message.content : [];
    const toolCalls: CanonicalToolCall[] = [];
    for (const block of blocks) {
      const item = asRecord(block);
      if (item?.type === "tool_use") {
        const name = toolName(item.name);
        if (!name) throw new TraceParseError("claude code tool_use block has no name");
        toolCalls.push({ name, ok: null });
      }
      if (item?.type === "tool_result") {
        markLastToolCall(messages, item.is_error !== true);
      }
    }
    messages.push({ role, text: text(message.content), toolCalls });
  }
  return finalize("claude_code", model, messages, outcome);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function attachToolCall(messages: CanonicalMessage[], call: CanonicalToolCall): void {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (lastAssistant) {
    lastAssistant.toolCalls.push(call);
    return;
  }
  messages.push({ role: "assistant", text: "", toolCalls: [call] });
}

function markLastToolCall(messages: readonly CanonicalMessage[], ok: boolean): void {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const calls = messages[index].toolCalls;
    for (let call = calls.length - 1; call >= 0; call -= 1) {
      if (calls[call].ok === null) {
        calls[call] = { ...calls[call], ok };
        return;
      }
    }
  }
}

function outcomeOf(value: unknown): TraceOutcome {
  if (typeof value === "boolean") return value ? "success" : "failure";
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (["success", "succeeded", "ok", "completed", "done", "pass"].includes(normalized)) {
    return "success";
  }
  if (["failure", "failed", "error", "aborted", "cancelled", "canceled", "timeout"].includes(normalized)) {
    return "failure";
  }
  return "unknown";
}

function finalize(
  format: TraceFormat,
  model: string | null,
  messages: CanonicalMessage[],
  outcome: TraceOutcome,
): CanonicalTrace {
  if (messages.length === 0) throw new TraceParseError("trace contains no messages");
  if (messages.length > MAX_MESSAGES) {
    throw new TraceParseError(`trace has more than ${MAX_MESSAGES} messages`);
  }
  const turnCount = messages.filter((message) => message.role === "assistant").length;
  const toolCallsCount = messages.reduce((total, message) => total + message.toolCalls.length, 0);
  return { format, model, messages, turnCount, toolCallsCount, outcome };
}

/**
 * Parses any supported trace export into the canonical schema. Throws
 * `TraceParseError` for empty, oversized, truncated, ambiguous or unknown
 * input — there is no lenient mode.
 */
export function parseTrace(raw: string): CanonicalTrace {
  if (typeof raw !== "string") throw new TraceParseError("trace must be text");
  if (raw.trim().length === 0) throw new TraceParseError("trace is empty");
  if (raw.length > MAX_BYTES) throw new TraceParseError("trace is larger than 8MB");
  const format = detectTraceFormat(raw);
  if (format === "hermes") return fromHermes(raw);
  const records = parseLines(raw);
  if (format === "claude_code") return fromClaudeCode(records);
  if (format === "codex") return fromCodex(records);
  return fromOpenClaw(records);
}
