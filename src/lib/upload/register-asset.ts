/**
 * Server side of an upload (goal.md P0-2): registers the asset record from the
 * hash the BROWSER computed. No bytes arrive here — plaintext never reaches
 * WTR servers (goal.md G3); the ciphertext is uploaded at stage 3a.
 */
import { withTransaction } from "../db/pool";
import { PgAssetStore } from "../pipeline/pg-store";
import { EVENT } from "../pipeline/types";
import type { Modality } from "./modality";

export interface RegisterAssetInput {
  creatorId: string;
  filename: string;
  byteSize: number;
  mimeType: string;
  modality: Modality;
  /** 64 hex chars, computed in the browser via crypto.subtle / stream hash. */
  contentSha256: string;
}

export interface RegisterAssetResult {
  assetId: string;
  /** True when the same creator already registered these exact bytes. */
  existing: boolean;
  duplicateClaimFlag: boolean;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export async function registerAsset(input: RegisterAssetInput): Promise<RegisterAssetResult> {
  if (!SHA256_HEX.test(input.contentSha256)) {
    throw new Error("contentSha256 must be 64 lowercase hex characters");
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    throw new Error("byteSize must be a positive integer");
  }

  return withTransaction(async (tx) => {
    // Same creator + same bytes → the existing asset, never a second row.
    const existing = await tx.query<{ id: string; duplicate_claim_flag: boolean }>(
      `SELECT id, duplicate_claim_flag FROM asset
       WHERE creator_id = $1 AND content_sha256 = $2`,
      [input.creatorId, input.contentSha256],
    );
    if (existing.rows[0]) {
      return {
        assetId: existing.rows[0].id,
        existing: true,
        duplicateClaimFlag: existing.rows[0].duplicate_claim_flag,
      };
    }

    const inserted = await tx.query<{ id: string; duplicate_claim_flag: boolean }>(
      `INSERT INTO asset (creator_id, media_type, modality, filename, byte_size, content_sha256)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, duplicate_claim_flag`,
      [
        input.creatorId,
        input.mimeType,
        input.modality,
        input.filename,
        input.byteSize,
        input.contentSha256,
      ],
    );
    const assetId = inserted.rows[0].id;
    const duplicateClaimFlag = inserted.rows[0].duplicate_claim_flag;

    const store = new PgAssetStore(tx);
    await store.appendEvent({
      assetId,
      eventType: EVENT.INGESTED,
      idempotencyKey: `ingest:${assetId}`,
      payload: {
        content_sha256: input.contentSha256,
        byte_size: input.byteSize,
        media_type: input.mimeType,
        hashed_by: "browser",
      },
    });
    if (duplicateClaimFlag) {
      await store.appendEvent({
        assetId,
        eventType: EVENT.DUPLICATE_CLAIM_FLAGGED,
        idempotencyKey: `duplicate-claim:${assetId}`,
        payload: { content_sha256: input.contentSha256, resolution: "pending_human_review" },
      });
    }

    return { assetId, existing: false, duplicateClaimFlag };
  });
}
