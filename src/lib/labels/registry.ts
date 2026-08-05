/**
 * Job-type registry for the labeling queue.
 *
 * `label_job` started life as the tier-2 vision queue; migration 0008 added
 * `job_type` and `spec` so the same queue can carry any labeler. A labeler
 * registers here and the pipeline core never has to learn about it: enqueueing
 * and running are generic over `job_type`.
 *
 * INVARIANT: a labeler never receives plaintext originals or keys. It gets the
 * degraded preview, a redacted preview, or client-computed metadata carried in
 * `spec` — nothing else ever reaches WTR servers to hand to a model.
 */
import { db, type Queryable } from "../db/pool";
import { log } from "../log";

/** Everything a labeler is given to do its work. */
export interface JobContext {
  jobId: string;
  assetId: string;
  /** Job input recorded on the row; never plaintext media. */
  spec: unknown;
  /** Injected so tests never touch the network. */
  fetchImpl: typeof fetch;
  q: Queryable;
}

export interface JobType {
  /** Stable identifier persisted in `label_job.job_type`. */
  name: string;
  /** Kept for the existing tier semantics: 1 = deterministic, 2 = model. */
  tier: number;
  /**
   * False when the job cannot run yet (no model configured). Such jobs are
   * parked as 'awaiting_model' rather than pretending to be runnable.
   */
  isConfigured: () => boolean;
  /** Model recorded on the claimed row, when the labeler uses one. */
  modelId?: () => string | null;
  /** Does the work. Throwing marks the job 'failed' with the message. */
  run: (context: JobContext) => Promise<void>;
}

const REGISTRY = new Map<string, JobType>();

export function registerJobType(jobType: JobType): void {
  if (REGISTRY.has(jobType.name)) {
    throw new Error(`job type '${jobType.name}' is already registered`);
  }
  REGISTRY.set(jobType.name, jobType);
}

export function getJobType(name: string): JobType | undefined {
  return REGISTRY.get(name);
}

export function requireJobType(name: string): JobType {
  const jobType = REGISTRY.get(name);
  if (!jobType) throw new Error(`unknown job type '${name}'`);
  return jobType;
}

export function listJobTypes(): JobType[] {
  return [...REGISTRY.values()];
}

/** Test seam: drops a registration so suites stay independent. */
export function unregisterJobType(name: string): void {
  REGISTRY.delete(name);
}

const UNFINISHED = "('awaiting_model', 'queued', 'running')";

/**
 * Records a job of any registered type. Idempotent per (asset, job_type): an
 * existing unfinished job is reused rather than duplicated, and a parked
 * 'awaiting_model' row is promoted once its labeler becomes configured.
 */
export async function enqueueJob(
  assetId: string,
  jobTypeName: string,
  spec: unknown = null,
  q: Queryable = db,
): Promise<"queued" | "awaiting_model"> {
  const jobType = requireJobType(jobTypeName);
  const state = jobType.isConfigured() ? "queued" : "awaiting_model";
  const existing = await q.query<{ id: string }>(
    `SELECT id FROM label_job
     WHERE asset_id = $1 AND job_type = $2 AND state IN ${UNFINISHED}`,
    [assetId, jobTypeName],
  );
  if (existing.rows.length === 0) {
    await q.query(
      `INSERT INTO label_job (asset_id, tier, job_type, state, spec)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [assetId, jobType.tier, jobTypeName, state, spec === null ? null : JSON.stringify(spec)],
    );
  } else if (state === "queued") {
    await q.query(
      `UPDATE label_job SET state = 'queued', updated_at = now()
       WHERE asset_id = $1 AND job_type = $2 AND state = 'awaiting_model'`,
      [assetId, jobTypeName],
    );
  }
  return state;
}

/**
 * Runs the oldest queued job of one type for one asset. Exactly one row is
 * claimed — an asset may carry several queued jobs of a type whose spec is the
 * unit of work (a preference pair), and claiming the rest would strand them in
 * 'running'. Concurrent invocations cannot double-label; an unclaimable job is
 * a no-op.
 */
export async function runJob(
  assetId: string,
  jobTypeName: string,
  options: { fetchImpl?: typeof fetch; q?: Queryable } = {},
): Promise<void> {
  const jobType = requireJobType(jobTypeName);
  const q = options.q ?? db;
  const claimed = await q.query<{ id: string; spec: unknown }>(
    `UPDATE label_job SET state = 'running', model_id = $3, updated_at = now()
     WHERE id = (
       SELECT id FROM label_job
       WHERE asset_id = $1 AND job_type = $2 AND state = 'queued'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, spec`,
    [assetId, jobTypeName, jobType.modelId?.() ?? null],
  );
  const job = claimed.rows[0];
  if (!job) return;

  const finish = (state: "done" | "failed", error: string | null) =>
    q.query("UPDATE label_job SET state = $2, error = $3, updated_at = now() WHERE id = $1", [
      job.id,
      state,
      error,
    ]);

  try {
    await jobType.run({
      jobId: job.id,
      assetId,
      spec: job.spec ?? null,
      fetchImpl: options.fetchImpl ?? fetch,
      q,
    });
    await finish("done", null);
    log.info("label job complete", { assetId, jobType: jobTypeName });
  } catch (error) {
    await finish("failed", (error as Error).message);
    log.warn("label job failed", { assetId, jobType: jobTypeName });
  }
}
