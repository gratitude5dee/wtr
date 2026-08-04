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
  /** Whether the asset currently carries a matching active listing. */
  eligible: boolean;
}

/**
 * A creator's assets relevant to this request: those with an active listing
 * under the request's exact license preset, plus any already submitted —
 * even if the listing has since been paused, withdrawn or sold, so a pending
 * submission can always be seen and retracted.
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
    eligible: boolean;
  }>(
    `SELECT a.id AS asset_id, a.filename, s.status AS submission_status,
            (l.id IS NOT NULL) AS eligible
     FROM asset a
     CROSS JOIN data_request r
     LEFT JOIN listing l ON l.asset_id = a.id AND l.status = 'active'
                        AND l.license_preset = r.license_preset
     LEFT JOIN submission s ON s.data_request_id = r.id AND s.asset_id = a.id
     WHERE r.id = $2 AND a.creator_id = $1
       AND (l.id IS NOT NULL OR s.id IS NOT NULL)
     ORDER BY a.created_at DESC`,
    [creatorId, requestId],
  );
  return rows.rows.map((row) => ({
    assetId: row.asset_id,
    filename: row.filename,
    submissionStatus: row.submission_status,
    eligible: row.eligible,
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
    // Keyed on the submission row so a withdraw-then-resubmit produces a
    // fresh activity entry instead of colliding with the first one.
    await store.appendEvent({
      assetId,
      eventType: EVENT.SUBMITTED_TO_REQUEST,
      idempotencyKey: `submit:${inserted.rows[0].id}`,
      payload: { dataRequestId: requestId, submissionId: inserted.rows[0].id },
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
      idempotencyKey: `submit-withdraw:${removed.rows[0].id}`,
      payload: { dataRequestId: requestId, submissionId: removed.rows[0].id },
    });
  });
}
