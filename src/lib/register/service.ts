/**
 * The registration trigger (goal.md P0-4): runs stages 1–3 of the real
 * pipeline for one asset from the dashboard. Labels are sealed by the stage
 * handlers into the provenance metadata; a failure leaves the asset in
 * FAILED_REGISTER with completed sub-steps recorded, and the same call
 * retries by resuming (the handlers are idempotent).
 *
 * Registration talks to Aeneid and Trace for real, so it requires the
 * operator wallet and the Trace API key. Without them the trigger reports
 * exactly which credential is missing instead of pretending to register.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { MEDIA_DIR, TRACE_MODE } from "../../../config/env";
import { createClients } from "../chain/clients";
import { db } from "../db/pool";
import { createStageHandlers, type StageResult } from "../pipeline";
import { createMediaPort, createPorts } from "../pipeline/adapters";
import { PgAssetStore } from "../pipeline/pg-store";
import { getLicenseChoice } from "../listing/service";
import { createTraceClient, isTraceMock } from "../trace/factory";
import { assertAssetId } from "../upload/ciphertext-store";

/** Safe to echo to the creator. */
export class RegisterError extends Error {}

const TRIGGER_STAGES = ["IN_TRAY", "LABELED", "FAILED_REGISTER"] as const;

export interface Readiness {
  ready: boolean;
  /** Plain-language blockers, safe to render. */
  blockers: string[];
  stage: string;
}

export async function registrationReadiness(
  creatorId: string,
  assetId: string,
): Promise<Readiness | null> {
  const rows = await db.query<{ stage: string; ciphertext_complete: boolean }>(
    "SELECT stage::text AS stage, ciphertext_complete FROM asset WHERE id = $1 AND creator_id = $2",
    [assetId, creatorId],
  );
  const row = rows.rows[0];
  if (!row) return null;

  const blockers: string[] = [];
  if (!(TRIGGER_STAGES as readonly string[]).includes(row.stage)) {
    blockers.push("this asset is already registered");
  }
  if (!row.ciphertext_complete) {
    blockers.push("the encrypted upload has not finished");
  }
  const choice = await getLicenseChoice(assetId);
  if (!choice.preset || !choice.askPriceWei) {
    blockers.push("choose license terms and a price first");
  }
  if (!process.env.WTR_WALLET_PRIVATE_KEY) {
    blockers.push("the operator wallet is not configured on this server");
  }
  if (TRACE_MODE() === "live" && !process.env.WTR_TRACE_API_KEY) {
    blockers.push("the Trace provider key is not configured on this server");
  }
  return { ready: blockers.length === 0, blockers, stage: row.stage };
}

/** Which register sub-steps have already completed, for the retry UI. */
export async function registerProgress(assetId: string): Promise<Record<string, boolean>> {
  const rows = await db.query<{ event_type: string }>(
    `SELECT event_type FROM asset_event WHERE asset_id = $1 AND event_type IN
     ('asset.media_encrypted_uploaded', 'asset.trace_registered',
      'asset.ip_registered', 'asset.cdr_vault_allocated')`,
    [assetId],
  );
  const seen = new Set(rows.rows.map((row) => row.event_type));
  return {
    "3a": seen.has("asset.media_encrypted_uploaded"),
    "3b": seen.has("asset.trace_registered"),
    "3c": seen.has("asset.ip_registered"),
    "3d": seen.has("asset.cdr_vault_allocated"),
  };
}

export async function registerAsset(creatorId: string, assetId: string): Promise<StageResult[]> {
  const readiness = await registrationReadiness(creatorId, assetId);
  if (!readiness) throw new RegisterError("asset not found");
  if (!readiness.ready) throw new RegisterError(readiness.blockers[0]);
  const choice = await getLicenseChoice(assetId);
  if (!choice.preset || !choice.askPriceWei) throw new RegisterError("choose license terms first");
  const { preset, askPriceWei } = choice;

  const clients = await createClients();
  const trace = createTraceClient();
  const ports = createPorts({ clients, trace, traceMock: isTraceMock(), mediaDir: MEDIA_DIR() });
  // Browser-uploaded assets exist server-side only as ciphertext (the
  // original was sealed on the creator's device). Stage 3a therefore uploads
  // the server-held ciphertext file — the plaintext never touches WTR.
  ports.media = {
    ...createMediaPort({ clients, mediaDir: MEDIA_DIR() }),
    async readPlaintext() {
      assertAssetId(assetId);
      const filePath = path.join(MEDIA_DIR(), "ciphertext", `${assetId}.bin`);
      return new Uint8Array(await fs.readFile(filePath));
    },
  };

  const store = new PgAssetStore(db);
  const handlers = createStageHandlers({
    store,
    ports,
    owner: clients.account.address,
    now: () => new Date(),
    // Labels were reviewed by the creator in the dashboard and already live
    // in asset_label; the label stage seals what exists rather than proposing.
    proposeLabels: async () => [],
    quotePriceWei: async () => askPriceWei,
    buyer: { anonId: "anon-dashboard" },
    defaultLicensePreset: preset,
  });

  const results: StageResult[] = [];
  for (const handler of [handlers.ingest, handlers.label, handlers.register]) {
    const result = await handler(assetId);
    results.push(result);
    if (result.status === "failed") break;
  }
  return results;
}
