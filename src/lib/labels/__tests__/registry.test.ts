import { afterEach, describe, expect, it, vi } from "vitest";

import type { Queryable } from "../../db/pool";
import {
  enqueueJob,
  getJobType,
  listJobTypes,
  registerJobType,
  requireJobType,
  runJob,
  unregisterJobType,
} from "../registry";

interface Call {
  sql: string;
  params: readonly unknown[];
}

/** Minimal scripted Queryable: each SELECT/UPDATE returns the next queued rows. */
function fakeDb(rowsByCall: Record<string, unknown[]>): { q: Queryable; calls: Call[] } {
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

const NAME = "test_job";

afterEach(() => {
  unregisterJobType(NAME);
});

function register(overrides: Partial<Parameters<typeof registerJobType>[0]> = {}) {
  const run = vi.fn(async () => {});
  registerJobType({ name: NAME, tier: 2, isConfigured: () => true, run, ...overrides });
  return run;
}

describe("registry", () => {
  it("registers, looks up and lists job types", () => {
    register();
    expect(getJobType(NAME)?.tier).toBe(2);
    expect(listJobTypes().map((jobType) => jobType.name)).toContain(NAME);
  });

  it("rejects a duplicate registration", () => {
    register();
    expect(() => register()).toThrow(/already registered/);
  });

  it("requireJobType throws for an unknown name", () => {
    expect(() => requireJobType("nope")).toThrow(/unknown job type/);
  });
});

describe("enqueueJob", () => {
  it("inserts a queued row with the job type and spec when none exists", async () => {
    register();
    const { q, calls } = fakeDb({});
    await expect(enqueueJob("a1", NAME, { k: 1 }, q)).resolves.toBe("queued");
    const insert = calls.find((call) => call.sql.includes("INSERT INTO label_job"));
    expect(insert?.params).toEqual(["a1", 2, NAME, "queued", JSON.stringify({ k: 1 })]);
  });

  it("parks the job as awaiting_model when the labeler is not configured", async () => {
    register({ isConfigured: () => false });
    const { q, calls } = fakeDb({});
    await expect(enqueueJob("a1", NAME, null, q)).resolves.toBe("awaiting_model");
    const insert = calls.find((call) => call.sql.includes("INSERT INTO label_job"));
    expect(insert?.params[3]).toBe("awaiting_model");
    expect(insert?.params[4]).toBeNull();
  });

  it("does not duplicate an unfinished job, and promotes a parked one", async () => {
    register();
    const { q, calls } = fakeDb({ "SELECT id FROM label_job": [{ id: "j1" }] });
    await enqueueJob("a1", NAME, null, q);
    expect(calls.some((call) => call.sql.includes("INSERT INTO label_job"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("state = 'queued', updated_at"))).toBe(true);
  });

  it("refuses an unregistered job type", async () => {
    const { q } = fakeDb({});
    await expect(enqueueJob("a1", "ghost", null, q)).rejects.toThrow(/unknown job type/);
  });
});

describe("runJob", () => {
  it("claims the row, runs the labeler and marks the job done", async () => {
    const run = register({ modelId: () => "m1" });
    const { q, calls } = fakeDb({ "UPDATE label_job SET state = 'running'": [{ id: "j1", spec: { k: 1 } }] });
    await runJob("a1", NAME, { q });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ jobId: "j1", assetId: "a1", spec: { k: 1 } }));
    const finish = calls.at(-1);
    expect(finish?.params).toEqual(["j1", "done", null]);
  });

  it("records the labeler's failure on the row instead of throwing", async () => {
    register({
      run: async () => {
        throw new Error("model exploded");
      },
    });
    const { q, calls } = fakeDb({ "UPDATE label_job SET state = 'running'": [{ id: "j1", spec: null }] });
    await expect(runJob("a1", NAME, { q })).resolves.toBeUndefined();
    expect(calls.at(-1)?.params).toEqual(["j1", "failed", "model exploded"]);
  });

  it("is a no-op when no queued row can be claimed", async () => {
    const run = register();
    const { q, calls } = fakeDb({});
    await runJob("a1", NAME, { q });
    expect(run).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });
});
