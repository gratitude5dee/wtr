import { describe, expect, it, vi } from "vitest";

import { buildTraceSpec } from "../client";
import { MAX_BYTES, TraceParseError } from "../parse";

const HERMES = JSON.stringify({
  model: "claude-sonnet-4",
  conversations: [
    { from: "human", value: "run the tests" },
    { from: "gpt", value: "done" },
  ],
});

function traceFile(body: string, size?: number): File {
  const file = new File([body], "session.jsonl", { type: "application/jsonl" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("buildTraceSpec", () => {
  it("derives the structure and the redacted preview on the device", async () => {
    const spec = await buildTraceSpec(traceFile(HERMES));
    expect(spec.structure.turnCount).toBe(1);
    expect(spec.preview.messages).toHaveLength(2);
    // Nothing that could carry plaintext beyond the redacted preview.
    expect(Object.keys(spec).sort()).toEqual(["preview", "structure"]);
  });

  it("refuses an oversized export before reading it into memory", async () => {
    const file = traceFile(HERMES, MAX_BYTES + 1);
    const text = vi.spyOn(file, "text");
    await expect(buildTraceSpec(file)).rejects.toBeInstanceOf(TraceParseError);
    expect(text).not.toHaveBeenCalled();
  });
});
