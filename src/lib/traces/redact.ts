/**
 * Trace redaction — the mechanism that keeps the WTR invariant true for the
 * `agenttrace` modality: plaintext originals never reach WTR servers.
 *
 * A trace's plaintext is prose, so unlike media it cannot be "degraded" by
 * re-encoding. Two derived artifacts are produced in the browser instead, and
 * only these ever leave the device:
 *
 *   1. `traceStructure()` — pure counts and shape (turns, tool names, outcome).
 *      No message text at all. This is what the deterministic labeler uses.
 *   2. `redactTrace()` — the *redacted preview*: at most `MAX_PREVIEW_MESSAGES`
 *      messages, each truncated to `MAX_PREVIEW_CHARS`, with every
 *      secret- or PII-shaped token replaced by a `[redacted:kind]` marker.
 *      This is the only text an LLM judge may see.
 *
 * The redaction is deliberately shape-based rather than name-based (the same
 * reasoning as `src/lib/log.ts`): field names in a third-party trace are
 * open-ended, so the guarantee has to come from matching the value.
 */
import type { CanonicalTrace, TraceOutcome, TraceRole } from "./parse";

export interface TraceStructure {
  format: string;
  model: string | null;
  turnCount: number;
  toolCallsCount: number;
  toolNames: string[];
  failedToolCalls: number;
  outcome: TraceOutcome;
  messageCount: number;
}

export interface RedactedMessage {
  role: TraceRole;
  text: string;
  /** Length of the original message, so a judge can weigh truncation. */
  originalChars: number;
  toolNames: string[];
}

export interface RedactedTrace {
  format: string;
  model: string | null;
  turnCount: number;
  toolCallsCount: number;
  outcome: TraceOutcome;
  truncated: boolean;
  messages: RedactedMessage[];
}

/** How much of a trace a judge is allowed to see. */
export const MAX_PREVIEW_MESSAGES = 40;
export const MAX_PREVIEW_CHARS = 400;
const MAX_TOOL_NAMES = 64;

/**
 * Shape-based scrubbers, applied in order. Each replaces the matched span
 * with a marker naming what was removed, so the judge still sees the shape of
 * the conversation without any of the sensitive content.
 */
const SCRUBBERS: { pattern: RegExp; marker: string }[] = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, marker: "[redacted:email]" },
  { pattern: /\b(?:https?|ftp|s3|file):\/\/\S+/gi, marker: "[redacted:url]" },
  { pattern: /-----BEGIN[\s\S]*?END[^-]*-----/g, marker: "[redacted:key]" },
  { pattern: /\b(?:0x)?[0-9a-fA-F]{32,}\b/g, marker: "[redacted:hex]" },
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, marker: "[redacted:token]" },
  { pattern: /(?:\/[\w.-]+){2,}/g, marker: "[redacted:path]" },
  { pattern: /\b(?:\d[ -]?){13,19}\b/g, marker: "[redacted:number]" },
  { pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, marker: "[redacted:ip]" },
];

/** Removes secret- and PII-shaped spans from one message body. */
export function redactText(value: string): string {
  let redacted = value;
  for (const { pattern, marker } of SCRUBBERS) {
    redacted = redacted.replace(pattern, marker);
  }
  return redacted;
}

/** A redacted preview that arrived from a client is not trusted. */
export class RedactionError extends Error {}

/**
 * Defence in depth: a preview submitted by a client is re-redacted and
 * re-clamped server-side before anything is allowed to send it to a model, so
 * a tampered client cannot smuggle plaintext to the provider.
 */
export function validateRedactedTrace(payload: unknown): RedactedTrace {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new RedactionError("expected a redacted trace preview");
  }
  const record = payload as Record<string, unknown>;
  const messages = record.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new RedactionError("redacted preview has no messages");
  }
  if (messages.length > MAX_PREVIEW_MESSAGES) {
    throw new RedactionError("redacted preview has too many messages");
  }
  const clean: RedactedMessage[] = messages.map((entry) => {
    const message = entry as Record<string, unknown> | null;
    if (typeof message !== "object" || message === null) {
      throw new RedactionError("redacted preview message is not an object");
    }
    const role = message.role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
      throw new RedactionError("redacted preview message has an unknown role");
    }
    const body = typeof message.text === "string" ? message.text : "";
    const toolNames = Array.isArray(message.toolNames)
      ? message.toolNames.filter((name): name is string => typeof name === "string").slice(0, MAX_TOOL_NAMES)
      : [];
    const originalChars = typeof message.originalChars === "number" ? message.originalChars : body.length;
    return {
      role,
      // Re-redacted and re-truncated, whatever the client claimed to have done.
      text: redactText(body).slice(0, MAX_PREVIEW_CHARS),
      originalChars: Math.max(0, Math.trunc(originalChars)),
      toolNames,
    };
  });
  const outcome = record.outcome;
  return {
    format: typeof record.format === "string" ? record.format.slice(0, 64) : "unknown",
    model: typeof record.model === "string" ? record.model.slice(0, 128) : null,
    turnCount: typeof record.turnCount === "number" ? Math.max(0, Math.trunc(record.turnCount)) : 0,
    toolCallsCount:
      typeof record.toolCallsCount === "number" ? Math.max(0, Math.trunc(record.toolCallsCount)) : 0,
    outcome: outcome === "success" || outcome === "failure" ? outcome : "unknown",
    truncated: record.truncated === true,
    messages: clean,
  };
}

/** Pure structure: counts and tool names only — never any message text. */
export function traceStructure(trace: CanonicalTrace): TraceStructure {
  const names = new Set<string>();
  let failed = 0;
  for (const message of trace.messages) {
    for (const call of message.toolCalls) {
      if (names.size < MAX_TOOL_NAMES) names.add(call.name);
      if (call.ok === false) failed += 1;
    }
  }
  return {
    format: trace.format,
    model: trace.model,
    turnCount: trace.turnCount,
    toolCallsCount: trace.toolCallsCount,
    toolNames: [...names].sort(),
    failedToolCalls: failed,
    outcome: trace.outcome,
    messageCount: trace.messages.length,
  };
}

/**
 * The redacted preview. Keeps the first and last messages of the session (the
 * task and its resolution are what a judge needs) and scrubs every body.
 */
export function redactTrace(trace: CanonicalTrace): RedactedTrace {
  const all = trace.messages;
  const truncated = all.length > MAX_PREVIEW_MESSAGES;
  const head = Math.ceil(MAX_PREVIEW_MESSAGES / 2);
  const kept = truncated ? [...all.slice(0, head), ...all.slice(all.length - (MAX_PREVIEW_MESSAGES - head))] : all;
  return {
    format: trace.format,
    model: trace.model,
    turnCount: trace.turnCount,
    toolCallsCount: trace.toolCallsCount,
    outcome: trace.outcome,
    truncated,
    messages: kept.map((message) => ({
      role: message.role,
      text: redactText(message.text).slice(0, MAX_PREVIEW_CHARS),
      originalChars: message.text.length,
      toolNames: message.toolCalls.map((call) => call.name),
    })),
  };
}
