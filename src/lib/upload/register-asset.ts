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
const MAX_FILENAME_LENGTH = 512;
const MAX_MIME_LENGTH = 255;
/** Anything past 1TB is not a real creator file. */
const MAX_BYTE_SIZE = 2 ** 40;

/** Bad input, safe to echo to the caller. Anything else is a 500. */
export class UploadValidationError extends Error {}

export async function registerAsset(input: RegisterAssetInput): Promise<RegisterAssetResult> {
  if (!SHA256_HEX.test(input.contentSha256)) {
    throw new UploadValidationError("contentSha256 must be 64 lowercase hex characters");
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_BYTE_SIZE) {
    throw new UploadValidationError("byteSize must be a positive integer no larger than 1TB");
  }
  if (input.filename.length === 0 || input.filename.length > MAX_FILENAME_LENGTH) {
    throw new UploadValidationError(`filename must be 1–${MAX_FILENAME_LENGTH} characters`);
  }
  if (input.mimeType.length === 0 || input.mimeType.length > MAX_MIME_LENGTH) {
    throw new UploadValidationError(`mimeType must be 1–${MAX_MIME_LENGTH} characters`);
  }

  return withTransaction(async (tx) => {
    // Same creator + same bytes → the existing asset, never a second row.
    // ON CONFLICT keeps concurrent double-submits of the same file from
    // erroring: the loser re-reads the winner's row.
    const inserted = await tx.query<{ id: string; duplicate_claim_flag: boolean }>(
      `INSERT INTO asset (creator_id, media_type, modality, filename, byte_size, content_sha256)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT asset_creator_content_unique DO NOTHING
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
    if (!inserted.rows[0]) {
      const existing = await tx.query<{ id: string; duplicate_claim_flag: boolean }>(
        `SELECT id, duplicate_claim_flag FROM asset
         WHERE creator_id = $1 AND content_sha256 = $2`,
        [input.creatorId, input.contentSha256],
      );
      return {
        assetId: existing.rows[0].id,
        existing: true,
        duplicateClaimFlag: existing.rows[0].duplicate_claim_flag,
      };
    }
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
      // The trigger flagged every asset sharing these bytes; record the
      // collision on each of their timelines, not just the newcomer's.
      const flagged = await tx.query<{ id: string }>(
        "SELECT id FROM asset WHERE content_sha256 = $1",
        [input.contentSha256],
      );
      for (const row of flagged.rows) {
        await store.appendEvent({
          assetId: row.id,
          eventType: EVENT.DUPLICATE_CLAIM_FLAGGED,
          idempotencyKey: `duplicate-claim:${row.id}:${input.contentSha256}`,
          payload: { content_sha256: input.contentSha256, resolution: "pending_human_review" },
        });
      }
    }

    return { assetId, existing: false, duplicateClaimFlag };
  });
}
