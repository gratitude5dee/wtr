/**
 * Failure path first (goal.md §12): every stage handler is asserted against a
 * connection that drops mid-transaction, then against the retry that follows.
 *
 * The retry assertions are the important ones — they prove the handlers resume
 * rather than restart, so no upload, registration or mint happens twice.
 */
import { describe, expect, it } from "vitest";

import { createStageHandlers, runPipeline } from "..";
import { EVENT, FAILED_REGISTER } from "../types";
import { makeFixture, TEST_IP_ID } from "../testing/fixtures";

const countCalls = (calls: readonly string[], name: string) =>
  calls.filter((call) => call === name).length;

describe("stage 1 ingest — network drops while reading media", () => {
  it("fails without recording an ingest event", async () => {
    const fixture = await makeFixture({ dropAt: "media.readPlaintext" });
    const { ingest } = createStageHandlers(fixture.deps);

    const result = await ingest("asset-1");

    expect(result.status).toBe("failed");
    expect(result.error?.name).toBe("NetworkDropError");
    expect(fixture.store.events).toHaveLength(0);
  });

  it("succeeds on retry and stays idempotent afterwards", async () => {
    const fixture = await makeFixture({ dropAt: "media.readPlaintext", dropTimes: 1 });
    const { ingest } = createStageHandlers(fixture.deps);

    expect((await ingest("asset-1")).status).toBe("failed");
    expect((await ingest("asset-1")).status).toBe("completed");
    const third = await ingest("asset-1");

    expect(third.status).toBe("skipped");
    expect(
      fixture.store.events.filter((event) => event.eventType === EVENT.INGESTED),
    ).toHaveLength(1);
  });
});

describe("stage 2 label", () => {
  it("refuses to run before ingest", async () => {
    const fixture = await makeFixture();
    const { label } = createStageHandlers(fixture.deps);

    const result = await label("asset-1");

    expect(result.status).toBe("failed");
    expect(result.error?.name).toBe("StageOrderError");
  });

  it("does not persist a second label set on retry", async () => {
    const fixture = await makeFixture();
    const { ingest, label } = createStageHandlers(fixture.deps);
    await ingest("asset-1");

    await label("asset-1");
    const again = await label("asset-1");

    expect(again.status).toBe("skipped");
    expect(fixture.store.events.filter((event) => event.eventType === EVENT.LABELED)).toHaveLength(1);
  });
});

describe("stage 3 register — a drop at each sub-step", () => {
  const advanceToRegister = async (dropAt: string, dropTimes?: number) => {
    const fixture = await makeFixture({ dropAt, dropTimes });
    const handlers = createStageHandlers(fixture.deps);
    // Stage 1 and 2 must not be affected by a stage-3 fault.
    await handlers.ingest("asset-1");
    await handlers.label("asset-1");
    return { fixture, handlers };
  };

  it.each([
    ["3a", "media.uploadEncrypted", [] as string[]],
    ["3b", "trace.registerData", ["3a"]],
    ["3c", "story.registerIpAsset", ["3a", "3b"]],
    ["3d", "cdr.allocateLicenseVault", ["3a", "3b", "3c"]],
  ])(
    "leaves FAILED_REGISTER at %s with the earlier sub-steps recorded",
    async (subStep, dropAt, expectedCompleted) => {
      const { fixture, handlers } = await advanceToRegister(dropAt);

      const result = await handlers.register("asset-1");

      expect(result.status).toBe("failed");
      expect(result.stage).toBe(FAILED_REGISTER);
      expect(fixture.store.asset.stage).toBe(FAILED_REGISTER);
      expect(result.performed).toEqual(expectedCompleted);

      const failure = fixture.store.events.find(
        (event) => event.eventType === EVENT.REGISTER_FAILED,
      );
      expect(failure?.payload.sub_step).toBe(subStep);
      expect(failure?.payload.completed_sub_steps).toEqual(expectedCompleted);
    },
  );

  it("resumes at the failed sub-step instead of restarting", async () => {
    const { fixture, handlers } = await advanceToRegister("story.registerIpAsset", 1);

    const failed = await handlers.register("asset-1");
    expect(failed.performed).toEqual(["3a", "3b"]);

    const retried = await handlers.register("asset-1");

    expect(retried.status).toBe("completed");
    expect(retried.alreadyDone).toEqual(["3a", "3b"]);
    expect(retried.performed).toEqual(["3c", "3d"]);
    // The sub-steps that had already succeeded are never re-executed.
    expect(countCalls(fixture.calls, "media.uploadEncrypted")).toBe(1);
    expect(countCalls(fixture.calls, "trace.registerData")).toBe(1);
    // 3c was attempted twice — the dropped attempt plus the retry that landed.
    expect(countCalls(fixture.calls, "story.registerIpAsset")).toBe(2);
    expect(
      fixture.store.events.filter((event) => event.eventType === EVENT.IP_REGISTERED),
    ).toHaveLength(1);
    expect(fixture.store.asset.stage).toBe("REGISTERED");
  });

  it("never allocates the CDR vault before the ipId exists", async () => {
    const { fixture, handlers } = await advanceToRegister("story.registerIpAsset");

    await handlers.register("asset-1");

    expect(fixture.calls).not.toContain("cdr.allocateLicenseVault");
    expect(fixture.store.asset.cdrVaultUuid).toBeNull();
  });

  it("orders 3a → 3b → 3c → 3d on the happy path", async () => {
    const { fixture, handlers } = await advanceToRegister("none");

    await handlers.register("asset-1");

    const ordered = fixture.calls.filter((call) =>
      ["media.uploadEncrypted", "trace.registerData", "story.registerIpAsset", "cdr.allocateLicenseVault"].includes(
        call,
      ),
    );
    expect(ordered).toEqual([
      "media.uploadEncrypted",
      "trace.registerData",
      "story.registerIpAsset",
      "cdr.allocateLicenseVault",
    ]);
    expect(fixture.store.asset.ipId).toBe(TEST_IP_ID);
  });
});

describe("stage 4 list", () => {
  it("refuses to list an asset whose stage 3d never completed", async () => {
    const fixture = await makeFixture({ dropAt: "cdr.allocateLicenseVault" });
    const handlers = createStageHandlers(fixture.deps);
    await handlers.ingest("asset-1");
    await handlers.label("asset-1");
    await handlers.register("asset-1");

    const result = await handlers.list("asset-1");

    expect(result.status).toBe("failed");
    expect(result.error?.name).toBe("StageOrderError");
  });

  it("reuses the existing listing on retry", async () => {
    const fixture = await makeFixture();
    const handlers = createStageHandlers(fixture.deps);
    await handlers.ingest("asset-1");
    await handlers.label("asset-1");
    await handlers.register("asset-1");

    await handlers.list("asset-1");
    const again = await handlers.list("asset-1");

    expect(again.status).toBe("skipped");
    expect(fixture.store.listings).toHaveLength(1);
  });
});

describe("stage 5 settle — network drops around the mint and the Trace promotion", () => {
  const advanceToSettle = async (dropAt: string, dropTimes?: number) => {
    const fixture = await makeFixture({ dropAt, dropTimes });
    const handlers = createStageHandlers(fixture.deps);
    await handlers.ingest("asset-1");
    await handlers.label("asset-1");
    await handlers.register("asset-1");
    await handlers.list("asset-1");
    return { fixture, handlers };
  };

  it("records no sale when the mint transaction drops", async () => {
    const { fixture, handlers } = await advanceToSettle("settlement.mintLicenseTokens");

    const result = await handlers.settle("asset-1");

    expect(result.status).toBe("failed");
    expect(fixture.store.sales).toHaveLength(0);
    expect(fixture.store.asset.stage).toBe("LISTED");
  });

  it("does not mint twice when the Trace promotion drops after the sale", async () => {
    const { fixture, handlers } = await advanceToSettle("trace.updateMetadata", 1);

    const failed = await handlers.settle("asset-1");
    expect(failed.status).toBe("failed");
    expect(failed.performed).toEqual(["sale"]);
    expect(fixture.store.asset.stage).toBe("SOLD");
    // The promotion event is only written once Trace has accepted it.
    expect(
      fixture.store.events.filter((event) => event.eventType === EVENT.PAYOUT_CREDITED),
    ).toHaveLength(0);

    const retried = await handlers.settle("asset-1");

    expect(retried.status).toBe("completed");
    expect(retried.alreadyDone).toEqual(["sale"]);
    expect(countCalls(fixture.calls, "settlement.mintLicenseTokens")).toBe(1);
    expect(fixture.store.asset.stage).toBe("SETTLED");
  });

  it("chains the promoted metadata root onto the registration root", async () => {
    const { fixture, handlers } = await advanceToSettle("none");
    const rootAfterRegister = fixture.store.asset.traceMetadataRoot;

    await handlers.settle("asset-1");

    const promoted = fixture.store.events.find(
      (event) => event.eventType === EVENT.PAYOUT_CREDITED,
    );
    expect(promoted?.promotedToTrace).toBe(true);
    expect(promoted?.traceSeq).toBe(1);
    expect(promoted?.payload.prev_metadata_root).toBe(rootAfterRegister);
    expect(fixture.store.asset.traceMetadataRoot).toBe(promoted?.payload.metadata_root);
    expect(fixture.store.asset.traceUpdateCount).toBe(1);
  });
});

describe("full pipeline", () => {
  it("takes one asset from IN_TRAY to SETTLED", async () => {
    const fixture = await makeFixture();
    const handlers = createStageHandlers(fixture.deps);

    const results = await runPipeline(handlers, "asset-1");

    expect(results.map((result) => result.status)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
    expect(fixture.store.asset.stage).toBe("SETTLED");
  });

  it("is a no-op when replayed", async () => {
    const fixture = await makeFixture();
    const handlers = createStageHandlers(fixture.deps);
    await runPipeline(handlers, "asset-1");
    const callsAfterFirstRun = fixture.calls.length;

    const replay = await runPipeline(handlers, "asset-1");

    expect(replay.every((result) => result.status === "skipped")).toBe(true);
    expect(fixture.calls).toHaveLength(callsAfterFirstRun);
  });
});
