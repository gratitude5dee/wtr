/**
 * Consent reads/writes (goal.md P0-1). Acceptance is append-only: a new
 * acceptance INSERTs a row and marks the previous one superseded via
 * `revoked_at` — never an UPDATE of the acceptance content itself, so the
 * consent state at any past instant stays reconstructible.
 */
import { db, type Queryable, withTransaction } from "../db/pool";
import {
  CURRENT_PRIVACY,
  CURRENT_SCOPES,
  CURRENT_TOS,
  documentSha256,
} from "./documents";

export interface ActiveConsent {
  id: string;
  documentVersion: string;
  privacyVersion: string | null;
  acceptedAt: Date;
}

/** The creator's unrevoked acceptance, if any. */
export async function getActiveConsent(
  creatorId: string,
  q: Queryable = db,
): Promise<ActiveConsent | null> {
  const result = await q.query<{
    id: string;
    document_version: string;
    privacy_version: string | null;
    accepted_at: Date;
  }>(
    `SELECT id, document_version, privacy_version, accepted_at
     FROM consent_acceptance
     WHERE creator_id = $1 AND revoked_at IS NULL
     ORDER BY accepted_at DESC LIMIT 1`,
    [creatorId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    documentVersion: row.document_version,
    privacyVersion: row.privacy_version,
    acceptedAt: row.accepted_at,
  };
}

/** An active acceptance of the CURRENT documents gates the upload surface. */
export async function hasCurrentConsent(creatorId: string, q: Queryable = db): Promise<boolean> {
  const active = await getActiveConsent(creatorId, q);
  return (
    active !== null &&
    active.documentVersion === CURRENT_TOS.version &&
    active.privacyVersion === CURRENT_PRIVACY.version
  );
}

/**
 * Records acceptance of the current ToS + privacy policy. The prior active
 * row (if any) gets `revoked_at` stamped — its content is untouched, and
 * assets listed under it keep pointing at it.
 */
export async function acceptCurrentConsent(creatorId: string, q?: Queryable): Promise<string> {
  const [tosSha, privacySha] = await Promise.all([
    documentSha256(CURRENT_TOS),
    documentSha256(CURRENT_PRIVACY),
  ]);
  const run = async (tx: Queryable) => {
    await tx.query(
      `UPDATE consent_acceptance SET revoked_at = now()
       WHERE creator_id = $1 AND revoked_at IS NULL`,
      [creatorId],
    );
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO consent_acceptance
         (creator_id, document_version, document_sha256, document_uri,
          privacy_version, privacy_sha256, privacy_uri, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        creatorId,
        CURRENT_TOS.version,
        tosSha,
        CURRENT_TOS.uri,
        CURRENT_PRIVACY.version,
        privacySha,
        CURRENT_PRIVACY.uri,
        JSON.stringify(CURRENT_SCOPES),
      ],
    );
    return inserted.rows[0].id;
  };
  return q ? run(q) : withTransaction(run);
}

/** Creates the creator account and their first consent acceptance together. */
export async function createCreatorWithConsent(input: {
  displayName: string;
  walletAddress?: string;
}): Promise<string> {
  const anonId = `anon-${crypto.randomUUID().slice(0, 12)}`;
  // One transaction: an account must never exist without its consent row.
  return withTransaction(async (tx) => {
    const created = await tx.query<{ id: string }>(
      `INSERT INTO creator (anon_id, display_name, wallet_address)
       VALUES ($1, $2, $3) RETURNING id`,
      [anonId, input.displayName, input.walletAddress ?? null],
    );
    const creatorId = created.rows[0].id;
    await acceptCurrentConsent(creatorId, tx);
    return creatorId;
  });
}
