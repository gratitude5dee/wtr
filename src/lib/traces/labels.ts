/**
 * Labels for the `agenttrace` modality.
 *
 * Two independent producers, mirroring tier 1 / tier 2 for media:
 *   - deterministic structural labels, derived in the BROWSER from the
 *     plaintext trace and carried to the server as counts in the job `spec`
 *     (see `redact.ts` — the server never sees the trace itself);
 *   - optional LLM-as-judge quality labels, produced from the *redacted
 *     preview* by the same env-configured OpenAI-compatible provider as
 *     `src/lib/labels/tier2.ts`. Unconfigured means the job is parked as
 *     'awaiting_model'; WTR never invents a judgement.
 *
 * Every emitted key must be in `TRACE_KEYS`. Anything else — from a client
 * payload or from a model — is dropped.
 */
import { TIER2_API_KEY, TIER2_API_URL, TIER2_MODEL } from "../../../config/env";
import { TIER1_NAMESPACE } from "../labels/tier1";
import type { LabelInput } from "../pipeline/store";

import { MAX_MODEL_CHARS, MAX_TOOL_NAME_CHARS } from "./parse";
import type { RedactedTrace, TraceStructure } from "./redact";

/** Trace labels share the `wtr` namespace with tier-1/tier-2 labels. */
export const TRACE_NAMESPACE = TIER1_NAMESPACE;

/** Deterministic, structure-derived keys. */
export const TRACE_STRUCTURAL_KEYS = [
  "turn_count",
  "tool_calls_count",
  "model_family",
  "outcome",
  "task_category",
] as const;

/** Optional LLM-as-judge keys. */
export const TRACE_JUDGE_KEYS = [
  "judge_task_success",
  "judge_instruction_following",
  "judge_efficiency",
] as const;

/** The complete allowed key set for the trace modality. */
export const TRACE_KEYS = new Set<string>([...TRACE_STRUCTURAL_KEYS, ...TRACE_JUDGE_KEYS]);

/** Bad client-supplied structure. Safe to echo to the caller. */
export class TraceLabelError extends Error {}

const MAX_COUNT = 1_000_000;
const MAX_VALUE_CHARS = 80;

const MODEL_FAMILIES: { pattern: RegExp; family: string }[] = [
  { pattern: /^(?:openai\/)?(?:gpt|o[134])[-\d]/i, family: "gpt" },
  { pattern: /codex/i, family: "gpt" },
  { pattern: /claude/i, family: "claude" },
  { pattern: /gemini/i, family: "gemini" },
  { pattern: /llama/i, family: "llama" },
  { pattern: /mistral|mixtral/i, family: "mistral" },
  { pattern: /qwen/i, family: "qwen" },
  { pattern: /deepseek/i, family: "deepseek" },
  { pattern: /grok/i, family: "grok" },
];

/** Coarse family of a model identifier; 'unknown' when nothing matches. */
export function modelFamily(model: string | null): string {
  if (!model) return "unknown";
  for (const { pattern, family } of MODEL_FAMILIES) {
    if (pattern.test(model)) return family;
  }
  return "other";
}

/**
 * Deterministic task category from the tools the agent actually used. First
 * match wins, so the category is stable for a given tool set.
 */
const TASK_CATEGORIES: { pattern: RegExp; category: string }[] = [
  { pattern: /edit|patch|write_file|create_file|apply|diff|str_replace/i, category: "code_editing" },
  { pattern: /bash|shell|exec|terminal|run_command|process/i, category: "shell_automation" },
  { pattern: /browser|playwright|navigate|click|screenshot/i, category: "browser_automation" },
  { pattern: /search|fetch|http|web|crawl|wiki/i, category: "research" },
  { pattern: /sql|query|database|table/i, category: "data_query" },
  { pattern: /read|grep|glob|list_files|find/i, category: "code_reading" },
];

export function taskCategory(toolNames: readonly string[]): string {
  for (const { pattern, category } of TASK_CATEGORIES) {
    if (toolNames.some((name) => pattern.test(name))) return category;
  }
  return toolNames.length > 0 ? "tool_use" : "conversation";
}

/** Structural labels for a trace whose structure was measured client-side. */
export function structuralTraceLabels(structure: TraceStructure): LabelInput[] {
  const label = (key: string, value: string | number): LabelInput => ({
    namespace: TRACE_NAMESPACE,
    key,
    value,
    source: "model",
    confidence: 1,
  });
  return [
    label("turn_count", structure.turnCount),
    label("tool_calls_count", structure.toolCallsCount),
    label("model_family", modelFamily(structure.model)),
    label("outcome", structure.outcome),
    label("task_category", taskCategory(structure.toolNames)),
  ];
}

const OUTCOMES = new Set(["success", "failure", "unknown"]);

/**
 * Validates the client-computed structure carried in the job `spec`. The
 * numbers come from a browser and are not trusted blindly: counts must be
 * sane non-negative integers, tool names must be short strings, and anything
 * unexpected is rejected outright.
 */
export function validateTraceStructure(payload: unknown): TraceStructure {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TraceLabelError("expected a trace structure object");
  }
  const record = payload as Record<string, unknown>;
  const count = (key: "turnCount" | "toolCallsCount" | "failedToolCalls" | "messageCount"): number => {
    const value = record[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_COUNT) {
      throw new TraceLabelError(`'${key}' must be an integer between 0 and ${MAX_COUNT}`);
    }
    return value;
  };
  const outcome = record.outcome;
  if (typeof outcome !== "string" || !OUTCOMES.has(outcome)) {
    throw new TraceLabelError("'outcome' must be success, failure or unknown");
  }
  const rawNames = record.toolNames;
  if (!Array.isArray(rawNames)) throw new TraceLabelError("'toolNames' must be an array");
  // The same limit the parser enforces, so a trace the browser could produce
  // is never rejected here.
  const toolNames = rawNames.map((name) => {
    if (typeof name !== "string" || name.length === 0 || name.length > MAX_TOOL_NAME_CHARS) {
      throw new TraceLabelError("each tool name must be a short string");
    }
    return name;
  });
  const model = record.model;
  if (model !== null && model !== undefined && typeof model !== "string") {
    throw new TraceLabelError("'model' must be a string when present");
  }
  const format = record.format;
  if (typeof format !== "string" || format.length === 0 || format.length > MAX_VALUE_CHARS) {
    throw new TraceLabelError("'format' must be a short string");
  }
  return {
    format,
    // Clamped rather than rejected: the model id only feeds `model_family`,
    // so an unusually long one must not cost the asset all of its labels.
    model: typeof model === "string" ? model.slice(0, MAX_MODEL_CHARS) : null,
    turnCount: count("turnCount"),
    toolCallsCount: count("toolCallsCount"),
    toolNames,
    failedToolCalls: count("failedToolCalls"),
    outcome: outcome as TraceStructure["outcome"],
    messageCount: count("messageCount"),
  };
}

// ---------------------------------------------------------------------------
// LLM-as-judge (optional)
// ---------------------------------------------------------------------------

export function traceJudgeConfigured(): boolean {
  return Boolean(TIER2_API_KEY() && TIER2_MODEL());
}

const JUDGE_PROMPT =
  "You grade an AI agent session for a data licensing catalog. You are given a REDACTED " +
  "excerpt of the session: message bodies are truncated and secrets, URLs, paths and " +
  "identifiers are replaced with [redacted:*] markers. Judge only what is visible. " +
  'Return JSON {"labels":[{"key":string,"value":string,"confidence":number}]} using only ' +
  "these keys: " +
  TRACE_JUDGE_KEYS.join(", ") +
  ". judge_task_success is 'yes'|'no'|'unclear'; judge_instruction_following and " +
  "judge_efficiency are 'low'|'medium'|'high'. confidence is 0..1.";

/** Parses and strictly validates a judge response into label inputs. */
export function parseJudgeResponse(raw: string, modelId: string): LabelInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TraceLabelError("trace judge returned invalid JSON");
  }
  const items =
    typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { labels?: unknown }).labels)
      ? ((parsed as { labels: unknown[] }).labels as unknown[])
      : [];
  const labels: LabelInput[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const { key, value, confidence } = item as Record<string, unknown>;
    if (typeof key !== "string" || !(TRACE_JUDGE_KEYS as readonly string[]).includes(key)) continue;
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_CHARS) continue;
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) continue;
    labels.push({
      namespace: TRACE_NAMESPACE,
      key,
      value,
      source: "model",
      confidence: Math.min(1, Math.max(0, confidence)),
      modelId,
    });
  }
  return labels;
}

/** Calls the OpenAI-compatible chat endpoint on the REDACTED preview only. */
export async function judgeRedactedTrace(
  preview: RedactedTrace,
  fetchImpl: typeof fetch = fetch,
): Promise<LabelInput[]> {
  const modelId = TIER2_MODEL();
  const response = await fetchImpl(`${TIER2_API_URL()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TIER2_API_KEY()}`,
    },
    body: JSON.stringify({
      model: modelId,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: JUDGE_PROMPT },
        { role: "user", content: JSON.stringify(preview) },
      ],
    }),
  });
  if (!response.ok) throw new TraceLabelError(`trace judge call failed with status ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new TraceLabelError("trace judge returned no content");
  return parseJudgeResponse(content, modelId);
}
