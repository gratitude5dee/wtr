import type { StageDeps } from "./deps";
import { createIngestHandler } from "./stages/ingest";
import { createLabelHandler } from "./stages/label";
import { createListHandler } from "./stages/list";
import { createRegisterHandler } from "./stages/register";
import { createSettleHandler } from "./stages/settle";
import type { StageHandler, StageResult } from "./types";

export interface StageHandlers {
  ingest: StageHandler;
  label: StageHandler;
  register: StageHandler;
  list: StageHandler;
  settle: StageHandler;
}

/** The five stage handlers, in pipeline order. */
export function createStageHandlers(deps: StageDeps): StageHandlers {
  return {
    ingest: createIngestHandler(deps),
    label: createLabelHandler(deps),
    register: createRegisterHandler(deps),
    list: createListHandler(deps),
    settle: createSettleHandler(deps),
  };
}

export const STAGE_ORDER = ["ingest", "label", "register", "list", "settle"] as const;
export type StageName = (typeof STAGE_ORDER)[number];

/** Drives one asset through every stage, stopping at the first failure. */
export async function runPipeline(
  handlers: StageHandlers,
  assetId: string,
): Promise<StageResult[]> {
  const results: StageResult[] = [];
  for (const name of STAGE_ORDER) {
    const result = await handlers[name](assetId);
    results.push(result);
    if (result.status === "failed") break;
  }
  return results;
}

export * from "./deps";
export * from "./ports";
export * from "./store";
export * from "./types";
