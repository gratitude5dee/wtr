import { afterEach, describe, expect, it, vi } from "vitest";

import type { Queryable } from "../../db/pool";
import {
  aggregateVotes,
  askJuror,
  configuredJurors,
  enqueuePreferenceJob,
  judgeWithJuror,
  juryConfigured,
  MAX_CANDIDATE_CHARS,
  parseVerdict,
  preferenceFingerprint,
  persistPreferencePair,
  PREFERENCE_JOB_TYPE,
  runJury,
  validatePreferenceSpec,
  type JurorVote,
  type JuryResult,
  type PreferenceSpec,
} from "../preference";
import { runJob } from "../registry";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(models = "openai:gpt-x,anthropic:claude-x,google:gemini-x,qwen:qwen-x") {
  vi.stubEnv("WTR_JURY_API_URL", "https://jury.example/v1");
  vi.stubEnv("WTR_JURY_API_KEY", "test-key");
  vi.stubEnv("WTR_JURY_MODELS", models);
}

const SPEC: PreferenceSpec = {
  prompt: "What does git reset --soft HEAD~1 do?",
  a: "Moves the branch back one commit; the changes stay staged.",
  b: "Moves the branch back one commit and unstages those changes.",
  sourceFamily: null,
  traceAssetId: null,
};

const noSleep = async () => {};

/** Replies with a scripted verdict per call, in order. */
function scriptedFetch(replies: (string | Error)[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    const reply = replies[calls.length - 1] ?? replies[replies.length - 1];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), {
      status: 200,
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function verdict(winner: string, confidence = 0.8, reason = "because") {
  return JSON.stringify({ winner, confidence, reason });
}

/** Which slot a candidate occupies in this request, so jurors stay consistent. */
function slotOf(body: Record<string, unknown>, candidate: string): "a" | "b" {
  const messages = body.messages as { content: string }[];
  const content = messages[messages.length - 1].content;
  return content.indexOf(candidate) < content.indexOf("ANSWER b:") ? "a" : "b";
}

/** A juror that consistently prefers one candidate, whatever the ordering. */
function consistentFetch(preferred: string, confidence = 0.8, only?: string) {
  const calls: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    calls.push(body);
    const content =
      only !== undefined && body.model !== only
        ? "}{"
        : verdict(slotOf(body, preferred), confidence);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function vote(overrides: Partial<JurorVote> = {}): JurorVote {
  return {
    juror: "m",
    family: "f",
    winner: "a",
    confidence: 0.8,
    forward: "a",
    reverse: "b",
    reason: null,
    ...overrides,
  };
}

interface Call {
  sql: string;
  params: readonly unknown[];
}

function fakeDb(rowsByCall: Record<string, unknown[]> = {}): { q: Queryable; calls: Call[] } {
  const calls: Call[] = [];
  const q: Queryable = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      const key = Object.keys(rowsByCall).find((fragment) => sql.includes(fragment));
      const rows = (key ? rowsByCall[key] : []) as never[];
      return { rows, rowCount: rows.length };
    },
  };
  return { q, calls };
}

describe("configuration", () => {
  it("is off without a key or models, and parses family:model entries", () => {
    vi.stubEnv("WTR_TIER2_API_KEY", "");
    vi.stubEnv("WTR_JURY_API_KEY", "");
    vi.stubEnv("WTR_JURY_MODELS", "");
    expect(juryConfigured()).toBe(false);
    configure("openai:gpt-x,bare-model");
    expect(juryConfigured()).toBe(true);
    expect(configuredJurors()).toEqual([
      { family: "openai", model: "gpt-x" },
      { family: "bare-model", model: "bare-model" },
    ]);
  });

  it("parks a job as awaiting_model while unconfigured", async () => {
    vi.stubEnv("WTR_TIER2_API_KEY", "");
    vi.stubEnv("WTR_JURY_API_KEY", "");
    vi.stubEnv("WTR_JURY_MODELS", "");
    const { q, calls } = fakeDb();
    await expect(
      enqueuePreferenceJob("asset-1", { prompt: SPEC.prompt, a: SPEC.a, b: SPEC.b }, q),
    ).resolves.toBe("awaiting_model");
    const insert = calls.find((call) => call.sql.includes("INSERT INTO label_job"));
    expect(insert?.params[1]).toBe(PREFERENCE_JOB_TYPE);
    expect(insert?.params[2]).toBe("awaiting_model");
  });

  it("refuses to run a jury when no model is configured", async () => {
    vi.stubEnv("WTR_TIER2_API_KEY", "");
    vi.stubEnv("WTR_JURY_API_KEY", "");
    vi.stubEnv("WTR_JURY_MODELS", "");
    await expect(runJury(SPEC, { sleep: noSleep })).rejects.toThrow(/no preference jury/);
  });
});

describe("enqueuePreferenceJob", () => {
  it("queues each distinct pair for an asset, keyed on a pair fingerprint", async () => {
    configure();
    const { q, calls } = fakeDb();
    await expect(
      enqueuePreferenceJob("asset-1", { prompt: SPEC.prompt, a: SPEC.a, b: SPEC.b }, q),
    ).resolves.toBe("queued");
    const select = calls[0];
    const insert = calls[1];
    expect(select.sql).toContain("spec->>'fingerprint'");
    expect(select.params[2]).toBe(await preferenceFingerprint(SPEC));
    expect(insert.sql).toContain("INSERT INTO label_job");
    expect(JSON.parse(String(insert.params[3]))).toMatchObject({
      prompt: SPEC.prompt,
      a: SPEC.a,
      b: SPEC.b,
      fingerprint: select.params[2],
    });
  });

  it("does not re-queue the same pair, whichever order its candidates arrive in", async () => {
    configure();
    const { q, calls } = fakeDb({ "SELECT id FROM label_job": [{ id: "job-1" }] });
    await enqueuePreferenceJob("asset-1", { prompt: SPEC.prompt, a: SPEC.b, b: SPEC.a }, q);
    expect(calls[0].params[2]).toBe(await preferenceFingerprint(SPEC));
    expect(calls.some((call) => call.sql.includes("INSERT INTO label_job"))).toBe(false);
    expect(calls[1].sql).toContain("state = 'queued'");
    expect(calls[1].params).toEqual(["job-1"]);
  });

  it("gives two different pairs on one asset two different fingerprints", async () => {
    const first = await preferenceFingerprint(SPEC);
    const second = await preferenceFingerprint({ ...SPEC, b: "a third answer" });
    const otherPrompt = await preferenceFingerprint({ ...SPEC, prompt: "another prompt" });
    expect(new Set([first, second, otherPrompt]).size).toBe(3);
  });
});

describe("validatePreferenceSpec", () => {
  it("accepts snake_case and camelCase optional fields", () => {
    expect(
      validatePreferenceSpec({
        prompt: "p",
        a: "one",
        b: "two",
        source_family: "openai",
        trace_asset_id: "t1",
      }),
    ).toEqual({ prompt: "p", a: "one", b: "two", sourceFamily: "openai", traceAssetId: "t1" });
  });

  it("rejects a missing candidate, identical candidates and a non-object spec", () => {
    expect(() => validatePreferenceSpec({ prompt: "p", a: "one" })).toThrow(/missing 'b'/);
    expect(() => validatePreferenceSpec({ prompt: "p", a: "x", b: "x" })).toThrow(/identical/);
    expect(() => validatePreferenceSpec(null)).toThrow(/must be an object/);
    expect(() => validatePreferenceSpec([1])).toThrow(/must be an object/);
  });

  it("rejects oversized candidate text instead of shipping it to a juror", () => {
    const huge = "x".repeat(MAX_CANDIDATE_CHARS + 1);
    expect(() => validatePreferenceSpec({ prompt: "p", a: huge, b: "two" })).toThrow(
      /'a' exceeds 8000 characters/,
    );
  });
});

describe("parseVerdict", () => {
  it("parses a well-formed verdict and truncates the rationale", () => {
    const parsed = parseVerdict(verdict("a", 0.5, "r".repeat(1000)));
    expect(parsed.winner).toBe("a");
    expect(parsed.confidence).toBe(0.5);
    expect(parsed.reason).toHaveLength(400);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseVerdict("not json")).toThrow(/invalid JSON/);
  });

  it("rejects a vote for a candidate that does not exist", () => {
    expect(() => parseVerdict(verdict("c"))).toThrow(/unknown candidate 'c'/);
  });

  it("rejects an out-of-range or non-numeric confidence", () => {
    expect(() => parseVerdict(verdict("a", 1.4))).toThrow(/confidence/);
    expect(() => parseVerdict(JSON.stringify({ winner: "a", confidence: "high" }))).toThrow(
      /confidence/,
    );
  });
});

describe("askJuror", () => {
  it("retries a broken juror and returns the first valid verdict", async () => {
    configure();
    const { fetchImpl, calls } = scriptedFetch(["}{", verdict("b", 0.6)]);
    const result = await askJuror("gpt-x", "p", "one", "two", { fetchImpl, sleep: noSleep });
    expect(result.winner).toBe("b");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://jury.example/v1/chat/completions");
  });

  it("gives up after four attempts rather than coercing a vote", async () => {
    configure();
    const { fetchImpl, calls } = scriptedFetch(["}{"]);
    await expect(askJuror("gpt-x", "p", "one", "two", { fetchImpl, sleep: noSleep })).rejects.toThrow(
      /invalid JSON/,
    );
    expect(calls).toHaveLength(4);
  });

  it("fails loudly on a non-2xx response", async () => {
    configure();
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(askJuror("gpt-x", "p", "one", "two", { fetchImpl, sleep: noSleep })).rejects.toThrow(
      /status 500/,
    );
  });
});

describe("judgeWithJuror", () => {
  it("judges both orderings and averages the two confidences", async () => {
    configure();
    const { fetchImpl, calls } = scriptedFetch([verdict("a", 0.6), verdict("b", 1)]);
    const result = await judgeWithJuror({ family: "openai", model: "gpt-x" }, SPEC, {
      fetchImpl,
      sleep: noSleep,
    });
    expect(result).toMatchObject({ winner: "a", confidence: 0.8, forward: "a", reverse: "b" });
    // Second call presents the candidates in the opposite order.
    const second = JSON.stringify(calls[1].body);
    expect(second.indexOf("ANSWER a:")).toBeLessThan(second.indexOf("ANSWER b:"));
    expect(calls[1].body).not.toEqual(calls[0].body);
  });

  it("records a tie when the verdict flips with the ordering", async () => {
    configure();
    const { fetchImpl } = scriptedFetch([verdict("a", 0.9), verdict("a", 0.5)]);
    const result = await judgeWithJuror({ family: "openai", model: "gpt-x" }, SPEC, {
      fetchImpl,
      sleep: noSleep,
    });
    expect(result).toMatchObject({ winner: "tie", confidence: 0.7, forward: "a", reverse: "a" });
  });
});

describe("aggregateVotes", () => {
  it("accepts a unanimous panel and averages confidence", () => {
    const result = aggregateVotes([
      vote({ confidence: 0.9 }),
      vote({ confidence: 0.7 }),
      vote({ confidence: 0.8 }),
      vote({ confidence: 1 }),
    ]);
    expect(result.winner).toBe("a");
    expect(result.agreement).toBe(1);
    expect(result.confidence).toBeCloseTo(0.85);
    expect(result.accepted).toBe(true);
  });

  it("accepts a 3/4 split and rejects a 2/3 split below the threshold", () => {
    const threeOfFour = aggregateVotes([vote(), vote(), vote(), vote({ winner: "b" })]);
    expect(threeOfFour).toMatchObject({ winner: "a", agreement: 0.75, accepted: true });

    const twoOfThree = aggregateVotes([vote(), vote(), vote({ winner: "b" })]);
    expect(twoOfThree.winner).toBe("a");
    expect(twoOfThree.agreement).toBeCloseTo(2 / 3);
    expect(twoOfThree.accepted).toBe(false);
  });

  it("never accepts a tie, even a unanimous one", () => {
    const result = aggregateVotes([vote({ winner: "tie" }), vote({ winner: "tie" })]);
    expect(result).toMatchObject({ winner: "tie", agreement: 1, accepted: false });
  });

  it("breaks an even count by first vote seen, and never accepts it", () => {
    const result = aggregateVotes([vote({ winner: "b" }), vote({ winner: "a" })]);
    expect(result).toMatchObject({ winner: "b", agreement: 0.5, accepted: false });
  });

  it("counts tie voters in the confidence mean but not in agreement", () => {
    const result = aggregateVotes([
      vote({ confidence: 1 }),
      vote({ confidence: 1 }),
      vote({ confidence: 1 }),
      vote({ winner: "tie", confidence: 0.2 }),
    ]);
    expect(result.agreement).toBe(0.75);
    expect(result.confidence).toBeCloseTo(0.8);
  });

  it("refuses to aggregate an empty panel", () => {
    expect(() => aggregateVotes([])).toThrow(/no juror produced a verdict/);
  });
});

describe("runJury", () => {
  it("drops a juror that never returns valid JSON and decides with the rest", async () => {
    configure("openai:gpt-x,anthropic:claude-x");
    const { fetchImpl, calls } = consistentFetch(SPEC.a, 0.9, "gpt-x");
    const result = await runJury(SPEC, { fetchImpl, sleep: noSleep });
    expect(result.votes.map((v) => v.juror)).toEqual(["gpt-x"]);
    expect(result).toMatchObject({ winner: "a", agreement: 1, accepted: true });
    // The dropped juror was retried the full four times before being dropped.
    expect(calls.filter((body) => body.model === "claude-x")).toHaveLength(4);
  });

  it("fails the job when every juror fails", async () => {
    configure("openai:gpt-x,anthropic:claude-x");
    const { fetchImpl } = scriptedFetch([new Error("provider down")]);
    await expect(runJury(SPEC, { fetchImpl, sleep: noSleep })).rejects.toThrow(
      /no juror produced a verdict/,
    );
  });

  it("recuses the family that authored the candidates", async () => {
    configure("openai:gpt-x,anthropic:claude-x");
    const { fetchImpl, calls } = consistentFetch(SPEC.a, 0.9);
    const result = await runJury({ ...SPEC, sourceFamily: "openai" }, { fetchImpl, sleep: noSleep });
    expect(result.recused).toEqual(["openai"]);
    expect(result.votes.map((v) => v.juror)).toEqual(["claude-x"]);
    expect(calls.every((body) => body.model === "claude-x")).toBe(true);
  });

  it("fails when every configured juror is recused", async () => {
    configure("openai:gpt-x");
    const { fetchImpl } = scriptedFetch([verdict("a")]);
    await expect(
      runJury({ ...SPEC, sourceFamily: "openai" }, { fetchImpl, sleep: noSleep }),
    ).rejects.toThrow(/every juror recused/);
  });
});

describe("persistPreferencePair", () => {
  const result: JuryResult = {
    winner: "b",
    agreement: 1,
    confidence: 0.9,
    votes: [vote({ winner: "b" })],
    recused: ["openai"],
    accepted: true,
  };

  it("writes chosen/rejected in jury order, once per job", async () => {
    const { q, calls } = fakeDb();
    await persistPreferencePair("job-1", "asset-1", { ...SPEC, traceAssetId: "trace-1" }, result, q);
    const insert = calls[0];
    expect(insert.sql).toContain("INSERT INTO preference_pair");
    expect(insert.sql).toContain("ON CONFLICT (job_id)");
    expect(insert.params.slice(0, 4)).toEqual([SPEC.prompt, SPEC.b, SPEC.a, 0.9]);
    expect(JSON.parse(String(insert.params[4]))).toMatchObject({
      agreement: 1,
      recused: ["openai"],
      votes: [{ winner: "b" }],
    });
    expect(insert.params.slice(5)).toEqual(["asset-1", "trace-1", "job-1"]);
  });

  it("refuses to persist a tie", async () => {
    const { q } = fakeDb();
    await expect(
      persistPreferencePair("job-1", "asset-1", SPEC, { ...result, winner: "tie" }, q),
    ).rejects.toThrow(/tied preference pair/);
  });
});

describe("the registered job type", () => {
  const claim = { "UPDATE label_job SET state = 'running'": [{ id: "job-1", spec: null }] };

  function claimWith(spec: unknown) {
    return { "UPDATE label_job SET state = 'running'": [{ id: "job-1", spec }] };
  }

  it("persists the pair the jury chose", async () => {
    configure("openai:gpt-x,anthropic:claude-x");
    const { fetchImpl } = consistentFetch(SPEC.a);
    const { q, calls } = fakeDb(claimWith({ prompt: SPEC.prompt, a: SPEC.a, b: SPEC.b }));
    await runJob("asset-1", PREFERENCE_JOB_TYPE, { q, fetchImpl });
    const insert = calls.find((call) => call.sql.includes("INSERT INTO preference_pair"));
    expect(insert?.params[1]).toBe(SPEC.a);
    expect(insert?.params[2]).toBe(SPEC.b);
    expect(calls.at(-1)?.params).toEqual(["job-1", "done", null]);
  });

  it("records no pair when the jury is indecisive", async () => {
    configure("openai:gpt-x,anthropic:claude-x");
    // Every juror flips with the ordering, so every juror ties.
    const { fetchImpl } = scriptedFetch([verdict("a", 0.8)]);
    const { q, calls } = fakeDb(claimWith({ prompt: SPEC.prompt, a: SPEC.a, b: SPEC.b }));
    await runJob("asset-1", PREFERENCE_JOB_TYPE, { q, fetchImpl });
    expect(calls.some((call) => call.sql.includes("INSERT INTO preference_pair"))).toBe(false);
    expect(calls.at(-1)?.params).toEqual(["job-1", "done", null]);
  });

  it("fails the job on a malformed spec without calling a juror", async () => {
    configure();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { q, calls } = fakeDb(claim);
    await runJob("asset-1", PREFERENCE_JOB_TYPE, { q, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls.at(-1)?.params).toEqual(["job-1", "failed", "preference spec must be an object"]);
  });
});
