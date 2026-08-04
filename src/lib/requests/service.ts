/**
 * Lab data requests (goal.md §6 data_request/submission). Labs post scoped
 * briefs; creators answer them by submitting assets that already carry a
 * matching active listing. Submitting never moves bytes — it records intent,
 * and the sale still settles through the license mint path, so the request
 * flow can never bypass the creator's license terms.
 */
import { db, withTransaction, type Queryable } from "../db/pool";
import { weiFromDb } from "../money";
import { PgAssetStore } from "../pipeline/pg-store";
import { EVENT } from "../pipeline/types";

/** Bad input, safe to echo to the caller. */
export class RequestError extends Error {}

export interface RequestDetail {
  id: string;
  title: string;
  spec: Record<string, unknown>;
  licensePreset: string;
  budgetWei: bigint;
  status: string;
  createdAt: Date;
}

export async function getRequest(requestId: string, q: Queryable = db): Promise<RequestDetail | null> {
  const rows = await q.query<{
    id: string;
    title: string;
    spec: Record<string, unknown>;
    license_preset: string;
    budget_wei: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, title, spec, license_preset, budget_wei::text AS budget_wei, status, created_at
     FROM data_request WHERE id = $1`,
    [requestId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    spec: row.spec,
    licensePreset: row.license_preset,
    budgetWei: weiFromDb(row.budget_wei),
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface EligibleAsset {
  assetId: string;
  filename: string | null;
  /** null = not submitted; otherwise pending/accepted/rejected. */
  submissionStatus: string | null;
}

/**
 * A creator's assets that can answer this request: an active listing under
 * the request's exact license preset. Withdrawn or unlisted work never shows.
 */
export async function eligibleAssets(
  creatorId: string,
  requestId: string,
  q: Queryable = db,
): Promise<EligibleAsset[]> {
  const rows = await q.query<{
    asset_id: string;
    filename: string | null;
    submission_status: string | null;
  }>(
    `SELECT a.id AS asset_id, a.filename, s.status AS submission_status
     FROM asset a
     JOIN listing l ON l.asset_id = a.id AND l.status = 'active'
     JOIN data_request r ON r.id = $2 AND r.license_preset = l.license_preset
     LEFT JOIN submission s ON s.data_request_id = $2 AND s.asset_id = a.id
     WHERE a.creator_id = $1
     ORDER BY a.created_at DESC`,
    [creatorId, requestId],
  );
  return rows.rows.map((row) => ({
    assetId: row.asset_id,
    filename: row.filename,
    submissionStatus: row.submission_status,
  }));
}

export async function submitAsset(
  creatorId: string,
  requestId: string,
  assetId: string,
): Promise<void> {
  await withTransaction(async (tx) => {
    const request = await tx.query<{ status: string; license_preset: string }>(
      "SELECT status, license_preset FROM data_request WHERE id = $1",
      [requestId],
    );
    if (!request.rows[0]) throw new RequestError("request not found");
    if (request.rows[0].status !== "open") {
      throw new RequestError("this request is no longer accepting submissions");
    }

    const eligible = await tx.query<{ id: string }>(
      `SELECT a.id FROM asset a
       JOIN listing l ON l.asset_id = a.id AND l.status = 'active' AND l.license_preset = $3
       WHERE a.id = $1 AND a.creator_id = $2`,
      [assetId, creatorId, request.rows[0].license_preset],
    );
    if (!eligible.rows[0]) {
      throw new RequestError("this asset has no active listing under the request's license terms");
    }

    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO submission (data_request_id, asset_id)
       VALUES ($1, $2)
       ON CONFLICT ON CONSTRAINT submission_unique DO NOTHING
       RETURNING id`,
      [requestId, assetId],
    );
    if (!inserted.rows[0]) throw new RequestError("this asset is already submitted");

    const store = new PgAssetStore(tx);
    await store.appendEvent({
      assetId,
      eventType: EVENT.SUBMITTED_TO_REQUEST,
      idempotencyKey: `submit:${requestId}:${assetId}`,
      payload: { dataRequestId: requestId },
    });
  });
}

export async function withdrawSubmission(
  creatorId: string,
  requestId: string,
  assetId: string,
): Promise<void> {
  await withTransaction(async (tx) => {
    const removed = await tx.query<{ id: string }>(
      `DELETE FROM submission s
       USING asset a
       WHERE s.data_request_id = $1 AND s.asset_id = $2
         AND a.id = s.asset_id AND a.creator_id = $3
         AND s.status = 'pending'
       RETURNING s.id`,
      [requestId, assetId, creatorId],
    );
    if (!removed.rows[0]) {
      throw new RequestError("no pending submission to withdraw — accepted ones are final");
    }

    const store = new PgAssetStore(tx);
    await store.appendEvent({
      assetId,
      eventType: EVENT.SUBMISSION_WITHDRAWN,
      idempotencyKey: `submit-withdraw:${requestId}:${assetId}:${Date.now()}`,
      payload: { dataRequestId: requestId },
    });
  });
}
