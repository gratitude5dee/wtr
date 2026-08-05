import { describe, expect, it } from "vitest";

import type { CanonicalTrace } from "../parse";
import {
  MAX_PREVIEW_CHARS,
  MAX_PREVIEW_MESSAGES,
  redactText,
  redactTrace,
  RedactionError,
  traceStructure,
  validateRedactedTrace,
} from "../redact";

function trace(overrides: Partial<CanonicalTrace> = {}): CanonicalTrace {
  return {
    format: "claude_code",
    model: "claude-sonnet-4",
    messages: [
      { role: "user", text: "fix it", toolCalls: [] },
      { role: "assistant", text: "ok", toolCalls: [{ name: "Bash", ok: true }, { name: "Edit", ok: false }] },
    ],
    turnCount: 1,
    toolCallsCount: 2,
    outcome: "success",
    ...overrides,
  };
}

describe("redactText", () => {
  it("removes secret- and PII-shaped spans by shape, not by name", () => {
    const raw = [
      "mail me at dev@example.com",
      "see https://internal.example.com/secret?token=1",
      "key 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "opened /home/ubuntu/repos/wtr/.env",
      "host 10.1.2.3",
      "card 4111 1111 1111 1111",
      "bearer ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop",
    ].join("\n");
    const redacted = redactText(raw);
    expect(redacted).not.toMatch(/example\.com/);
    expect(redacted).not.toMatch(/deadbeef/);
    expect(redacted).not.toMatch(/\.env/);
    expect(redacted).not.toMatch(/10\.1\.2\.3/);
    expect(redacted).not.toMatch(/4111/);
    expect(redacted).toMatch(/\[redacted:email\]/);
    expect(redacted).toMatch(/\[redacted:url\]/);
    expect(redacted).toMatch(/\[redacted:hex\]/);
    expect(redacted).toMatch(/\[redacted:path\]/);
  });

  it("removes PEM key blocks whole", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBg\n-----END PRIVATE KEY-----";
    expect(redactText(pem)).toBe("[redacted:key]");
  });

  it("leaves ordinary prose alone", () => {
    expect(redactText("the build passed in 12 seconds")).toBe("the build passed in 12 seconds");
  });
});

describe("traceStructure", () => {
  it("carries counts and tool names but never message text", () => {
    const structure = traceStructure(trace());
    expect(structure).toEqual({
      format: "claude_code",
      model: "claude-sonnet-4",
      turnCount: 1,
      toolCallsCount: 2,
      toolNames: ["Bash", "Edit"],
      failedToolCalls: 1,
      outcome: "success",
      messageCount: 2,
    });
    expect(JSON.stringify(structure)).not.toContain("fix it");
  });
});

describe("redactTrace", () => {
  it("scrubs and truncates every message body", () => {
    const preview = redactTrace(
      trace({
        messages: [
          { role: "user", text: `contact dev@example.com ${"a".repeat(1000)}`, toolCalls: [] },
        ],
      }),
    );
    expect(preview.messages[0].text.length).toBeLessThanOrEqual(MAX_PREVIEW_CHARS);
    expect(preview.messages[0].text).not.toContain("dev@example.com");
    expect(preview.messages[0].originalChars).toBeGreaterThan(MAX_PREVIEW_CHARS);
    expect(preview.truncated).toBe(false);
  });

  it("keeps the head and tail of a long session and flags the truncation", () => {
    const messages = Array.from({ length: 100 }, (_, index) => ({
      role: "user" as const,
      text: `message ${index}`,
      toolCalls: [],
    }));
    const preview = redactTrace(trace({ messages }));
    expect(preview.messages).toHaveLength(MAX_PREVIEW_MESSAGES);
    expect(preview.truncated).toBe(true);
    expect(preview.messages[0].text).toBe("message 0");
    expect(preview.messages.at(-1)?.text).toBe("message 99");
  });
});

describe("validateRedactedTrace", () => {
  it("re-redacts a preview supplied by a client", () => {
    const tampered = {
      format: "hermes",
      messages: [{ role: "user", text: `leak dev@example.com ${"b".repeat(900)}`, toolNames: [] }],
    };
    const clean = validateRedactedTrace(tampered);
    expect(clean.messages[0].text).not.toContain("dev@example.com");
    expect(clean.messages[0].text.length).toBeLessThanOrEqual(MAX_PREVIEW_CHARS);
    expect(clean.outcome).toBe("unknown");
  });

  it("scrubs and clamps every client-supplied string, not just the body", () => {
    const clean = validateRedactedTrace({
      format: "hermes",
      model: `claude-sonnet-4 dev@example.com`,
      messages: [
        {
          role: "user",
          text: "hi",
          toolNames: [`Bash leak dev@example.com ${"c".repeat(400)}`],
        },
      ],
    });
    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("dev@example.com");
    expect(clean.messages[0].toolNames[0].length).toBeLessThanOrEqual(128);
  });

  it("rejects a preview that is not a message list", () => {
    expect(() => validateRedactedTrace(null)).toThrow(RedactionError);
    expect(() => validateRedactedTrace({ messages: [] })).toThrow(/no messages/);
    expect(() => validateRedactedTrace({ messages: [{ role: "wizard", text: "" }] })).toThrow(
      /unknown role/,
    );
  });

  it("rejects a preview with more messages than the cap", () => {
    const messages = Array.from({ length: MAX_PREVIEW_MESSAGES + 1 }, () => ({
      role: "user",
      text: "hi",
      toolNames: [],
    }));
    expect(() => validateRedactedTrace({ messages })).toThrow(/too many messages/);
  });
});
