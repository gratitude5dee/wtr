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
import { LICENSE_PRESETS } from "../story/license-presets";

/** Bad input, safe to echo to the caller. */
export class RequestError extends Error {}

export interface RequestDetail {
  id: string;
  title: string;
  spec: Record<string, unknown>;
  licensePreset: string;
  budgetWei: bigint;
  unitPriceWei: bigint | null;
  kycRequired: boolean;
  deadline: Date | null;
  status: string;
  createdAt: Date;
  /** The account that posted the brief and reviews its submissions. */
  requesterCreatorId: string | null;
}

export async function getRequest(requestId: string, q: Queryable = db): Promise<RequestDetail | null> {
  const rows = await q.query<{
    id: string;
    title: string;
    spec: Record<string, unknown>;
    license_preset: string;
    budget_wei: string;
    unit_price_wei: string | null;
    kyc_required: boolean;
    deadline: Date | null;
    status: string;
    created_at: Date;
    requester_creator_id: string | null;
  }>(
    `SELECT id, title, spec, license_preset, budget_wei::text AS budget_wei,
            unit_price_wei::text AS unit_price_wei, kyc_required, deadline,
            status, created_at, requester_creator_id
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
    unitPriceWei: row.unit_price_wei === null ? null : weiFromDb(row.unit_price_wei),
    kycRequired: row.kyc_required,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    requesterCreatorId: row.requester_creator_id,
  };
}

export interface NewRequest {
  title: string;
  modality: string;
  notes: string;
  licensePreset: string;
  budgetWei: bigint;
  unitPriceWei: bigint | null;
  kycRequired: boolean;
  deadline: Date | null;
}

const MODALITIES = ["any", "audio", "image", "video", "3d", "motion"] as const;

/** Posts a brief owned by the signed-in account (goal.md P0-7). */
export async function createRequest(
  requester: { id: string; anonId: string },
  input: NewRequest,
  q: Queryable = db,
): Promise<string> {
  const title = input.title.trim();
  if (!title || title.length > 200) {
    throw new RequestError("give the request a title (at most 200 characters)");
  }
  if (!(MODALITIES as readonly string[]).includes(input.modality)) {
    throw new RequestError(`modality must be one of: ${MODALITIES.join(", ")}`);
  }
  if (!(LICENSE_PRESETS as readonly string[]).includes(input.licensePreset)) {
    throw new RequestError("choose one of the three license presets");
  }
  if (input.budgetWei <= 0n) throw new RequestError("budget must be positive");
  if (input.unitPriceWei !== null && input.unitPriceWei <= 0n) {
    throw new RequestError("per-item price must be positive when set");
  }
  if (input.deadline !== null) {
    if (Number.isNaN(input.deadline.getTime())) {
      throw new RequestError("enter a valid deadline");
    }
    if (input.deadline.getTime() <= Date.now()) {
      throw new RequestError("the deadline must be in the future");
    }
  }
  const rows = await q.query<{ id: string }>(
    `INSERT INTO data_request
       (requester_anon_id, requester_creator_id, title, spec, license_preset,
        budget_wei, unit_price_wei, kyc_required, deadline)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      requester.anonId,
      requester.id,
      title,
      JSON.stringify({ modality: input.modality, notes: input.notes.trim().slice(0, 2000) }),
      input.licensePreset,
      input.budgetWei.toString(),
      input.unitPriceWei === null ? null : input.unitPriceWei.toString(),
      input.kycRequired,
      input.deadline,
    ],
  );
  return rows.rows[0].id;
}

export interface ReviewSubmissionRow {
  submissionId: string;
  assetId: string;
  filename: string | null;
  creatorAnonId: string;
  creatorKycStatus: string;
  status: string;
  createdAt: Date;
}

/** Submissions on a request, visible only to the account that posted it. */
export async function listSubmissionsForReview(
  requesterCreatorId: string,
  requestId: string,
  q: Queryable = db,
): Promise<ReviewSubmissionRow[]> {
  const rows = await q.query<{
    submission_id: string;
    asset_id: string;
    filename: string | null;
    creator_anon_id: string;
    creator_kyc_status: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT s.id AS submission_id, s.asset_id, a.filename,
            c.anon_id AS creator_anon_id, c.kyc_status AS creator_kyc_status,
            s.status, s.created_at
     FROM submission s
     JOIN data_request r ON r.id = s.data_request_id
     JOIN asset a ON a.id = s.asset_id
     JOIN creator c ON c.id = a.creator_id
     WHERE s.data_request_id = $2 AND r.requester_creator_id = $1
     ORDER BY s.created_at ASC`,
    [requesterCreatorId, requestId],
  );
  return rows.rows.map((row) => ({
    submissionId: row.submission_id,
    assetId: row.asset_id,
    filename: row.filename,
    creatorAnonId: row.creator_anon_id,
    creatorKycStatus: row.creator_kyc_status,
    status: row.status,
    createdAt: row.created_at,
  }));
}

/**
 * Accept or reject a pending submission. Only the request owner may review,
 * and a decision is final — acceptance is what feeds the deliverable, so it
 * must never silently flip back to pending.
 */
export async function reviewSubmission(
  requesterCreatorId: string,
  submissionId: string,
  decision: "accepted" | "rejected",
): Promise<void> {
  await withTransaction(async (tx) => {
    const updated = await tx.query<{ id: string; asset_id: string; data_request_id: string }>(
      `UPDATE submission s
       SET status = $3, reviewed_at = now()
       FROM data_request r
       WHERE s.id = $1 AND r.id = s.data_request_id
         AND r.requester_creator_id = $2
         AND s.status = 'pending'
       RETURNING s.id, s.asset_id, s.data_request_id`,
      [submissionId, requesterCreatorId, decision],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new RequestError("no pending submission to review — decisions are final");
    }

    const store = new PgAssetStore(tx);
    await store.appendEvent({
      assetId: row.asset_id,
      eventType: decision === "accepted" ? EVENT.SUBMISSION_ACCEPTED : EVENT.SUBMISSION_REJECTED,
      idempotencyKey: `review:${row.id}`,
      payload: { dataRequestId: row.data_request_id, submissionId: row.id, decision },
    });
  });
}

/** Close an open request; submissions stop, pending ones stay reviewable. */
export async function closeRequest(
  requesterCreatorId: string,
  requestId: string,
  q: Queryable = db,
): Promise<void> {
  const closed = await q.query<{ id: string }>(
    `UPDATE data_request SET status = 'closed'
     WHERE id = $1 AND requester_creator_id = $2 AND status = 'open'
     RETURNING id`,
    [requestId, requesterCreatorId],
  );
  if (!closed.rows[0]) throw new RequestError("no open request of yours to close");
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
    const request = await tx.query<{
      status: string;
      license_preset: string;
      kyc_required: boolean;
      deadline: Date | null;
    }>(
      "SELECT status, license_preset, kyc_required, deadline FROM data_request WHERE id = $1",
      [requestId],
    );
    if (!request.rows[0]) throw new RequestError("request not found");
    if (request.rows[0].status !== "open") {
      throw new RequestError("this request is no longer accepting submissions");
    }
    if (request.rows[0].deadline && request.rows[0].deadline.getTime() <= Date.now()) {
      throw new RequestError("this request's deadline has passed");
    }
    if (request.rows[0].kyc_required) {
      const kyc = await tx.query<{ kyc_status: string }>(
        "SELECT kyc_status FROM creator WHERE id = $1",
        [creatorId],
      );
      if (kyc.rows[0]?.kyc_status !== "verified") {
        throw new RequestError("this request requires KYC-verified creators");
      }
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
