/**
 * DPO / pairwise-preference labeling with an LLM jury.
 *
 * A job carries one prompt and two candidate responses in its `spec`. A panel
 * of jurors — one per configured model — each judges the pair twice (a/b and
 * b/a); a juror whose verdict flips with the ordering is recorded as a tie.
 * The panel's votes are aggregated by plurality into a chosen/rejected pair
 * with an agreement ratio and a mean confidence, and only a decisive,
 * high-agreement result is persisted to `preference_pair`.
 *
 * The aggregation contract mirrors the agno cookbook reference
 * (cookbook/data_labeling/_05_text_pairwise_preference/dpo_jury.py):
 * position-swapped double judging, disagreement between the two orderings
 * collapsing to a tie, per-juror confidence averaged across the two runs,
 * plurality winner, agreement = winning votes / votes cast, jury confidence =
 * mean of every juror's confidence (tie voters included), a >= 0.75 agreement
 * gate for emitting a DPO record, bounded retries that never coerce a broken
 * verdict into a vote, and recusal of the juror family that authored the
 * candidates.
 *
 * INVARIANT: jurors only ever see what is already in the job spec — prompt and
 * candidate text that was produced client-side or from a degraded/redacted
 * preview. Plaintext originals and encryption keys never reach WTR servers, so
 * they can never reach a juror.
 */
import { JURY_API_KEY, JURY_API_URL, JURY_MODELS } from "../../../config/env";
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";
import { db, type Queryable } from "../db/pool";
import { log } from "../log";

import { getJobType, registerJobType, type JobContext } from "./registry";

export const PREFERENCE_JOB_TYPE = "text_pairwise_preference";

/** Below this share of the jury agreeing, the pair is left for a human. */
export const AGREEMENT_THRESHOLD = 0.75;

/** Attempts per juror call before that juror is dropped from the panel. */
export const JUROR_ATTEMPTS = 4;

export const MAX_PROMPT_CHARS = 8_000;
export const MAX_CANDIDATE_CHARS = 8_000;
const MAX_REASON_CHARS = 400;

export type Winner = "a" | "b" | "tie";

const SWAP: Record<Winner, Winner> = { a: "b", b: "a", tie: "tie" };

const RUBRIC =
  "Pick the more correct, more helpful answer; ties are allowed. Never reward length or a " +
  'confident tone. Reply with JSON {"winner":"a"|"b"|"tie","confidence":0..1,"reason":string}.';

/** One juror's answer to one ordering of the pair. */
export interface Verdict {
  winner: Winner;
  confidence: number;
  reason: string | null;
}

/** One juror's contribution to the panel, after both orderings. */
export interface JurorVote {
  /** Model id that voted. */
  juror: string;
  /** Family the juror belongs to; used for recusal. */
  family: string;
  winner: Winner;
  confidence: number;
  /** The two raw orderings, kept so a flip-to-tie stays auditable. */
  forward: Winner;
  reverse: Winner;
  reason: string | null;
}

export interface JuryResult {
  winner: Winner;
  /** Winning votes / votes cast. */
  agreement: number;
  /** Mean of every juror's confidence, tie voters included. */
  confidence: number;
  votes: JurorVote[];
  /** Families that sat out because they authored the candidates. */
  recused: string[];
  /** A decisive winner the jury agreed on strongly enough to train on. */
  accepted: boolean;
}

export interface PreferenceSpec {
  prompt: string;
  a: string;
  b: string;
  /** Model family that produced the candidates; recuses its own juror. */
  sourceFamily: string | null;
  /** Optional trace asset the pair was derived from. */
  traceAssetId: string | null;
}

/** A configured juror: `family:model-id`, or just `model-id`. */
interface Juror {
  family: string;
  model: string;
}

export function juryConfigured(): boolean {
  return Boolean(JURY_API_KEY() && JURY_MODELS().length > 0);
}

export function configuredJurors(): Juror[] {
  return JURY_MODELS().map((entry) => {
    const separator = entry.indexOf(":");
    if (separator === -1) return { family: entry, model: entry };
    return { family: entry.slice(0, separator), model: entry.slice(separator + 1) };
  });
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`preference spec is missing '${field}'`);
  }
  if (value.length > max) {
    throw new Error(`preference spec '${field}' exceeds ${max} characters`);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`preference spec '${field}' must be a string`);
  return value.length > 0 ? value : null;
}

/** Strictly validates the job spec; a malformed spec fails the job. */
export function validatePreferenceSpec(spec: unknown): PreferenceSpec {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    throw new Error("preference spec must be an object");
  }
  const raw = spec as Record<string, unknown>;
  const parsed: PreferenceSpec = {
    prompt: text(raw.prompt, "prompt", MAX_PROMPT_CHARS),
    a: text(raw.a, "a", MAX_CANDIDATE_CHARS),
    b: text(raw.b, "b", MAX_CANDIDATE_CHARS),
    sourceFamily: optionalText(raw.sourceFamily ?? raw.source_family, "sourceFamily"),
    traceAssetId: optionalText(raw.traceAssetId ?? raw.trace_asset_id, "traceAssetId"),
  };
  if (parsed.a === parsed.b) throw new Error("preference spec candidates are identical");
  return parsed;
}

/** Parses one juror response. Anything off-contract throws — never coerced. */
export function parseVerdict(raw: string): Verdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("juror returned invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("juror returned invalid JSON");
  }
  const { winner, confidence, reason } = parsed as Record<string, unknown>;
  if (winner !== "a" && winner !== "b" && winner !== "tie") {
    throw new Error(`juror voted for unknown candidate '${String(winner)}'`);
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("juror returned an out-of-range confidence");
  }
  return {
    winner,
    confidence,
    reason: typeof reason === "string" && reason.length > 0 ? reason.slice(0, MAX_REASON_CHARS) : null,
  };
}

export interface JuryOptions {
  fetchImpl?: typeof fetch;
  /** Injected so tests never actually wait out the retry backoff. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function callJuror(
  model: string,
  prompt: string,
  first: string,
  second: string,
  fetchImpl: typeof fetch,
): Promise<Verdict> {
  const response = await fetchImpl(`${JURY_API_URL()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JURY_API_KEY()}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RUBRIC },
        { role: "user", content: `PROMPT:\n${prompt}\n\nANSWER a:\n${first}\n\nANSWER b:\n${second}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`juror call failed with status ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("juror returned no content");
  return parseVerdict(content);
}

/** Retries schema breaks and rate limits; never coerces a broken verdict. */
export async function askJuror(
  model: string,
  prompt: string,
  first: string,
  second: string,
  options: JuryOptions = {},
): Promise<Verdict> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  let lastError = new Error(`juror ${model} would not produce a valid verdict`);
  for (let attempt = 0; attempt < JUROR_ATTEMPTS; attempt += 1) {
    try {
      return await callJuror(model, prompt, first, second, fetchImpl);
    } catch (error) {
      lastError = error as Error;
      if (attempt < JUROR_ATTEMPTS - 1) await sleep(2 ** attempt * 1000);
    }
  }
  throw lastError;
}

/** Judges the same pair in both orderings; an order-sensitive juror ties. */
export async function judgeWithJuror(
  juror: Juror,
  spec: PreferenceSpec,
  options: JuryOptions = {},
): Promise<JurorVote> {
  const forward = await askJuror(juror.model, spec.prompt, spec.a, spec.b, options);
  const reverse = await askJuror(juror.model, spec.prompt, spec.b, spec.a, options);
  const consistent = forward.winner === SWAP[reverse.winner];
  return {
    juror: juror.model,
    family: juror.family,
    winner: consistent ? forward.winner : "tie",
    confidence: (forward.confidence + reverse.confidence) / 2,
    forward: forward.winner,
    reverse: reverse.winner,
    reason: forward.reason,
  };
}

/**
 * Plurality vote over the panel. On an exact count tie the first winner
 * encountered wins, matching `Counter.most_common(1)` in the reference.
 */
export function aggregateVotes(votes: JurorVote[]): Omit<JuryResult, "votes" | "recused"> {
  if (votes.length === 0) throw new Error("no juror produced a verdict");
  const counts = new Map<Winner, number>();
  for (const vote of votes) counts.set(vote.winner, (counts.get(vote.winner) ?? 0) + 1);
  let winner: Winner = "tie";
  let count = -1;
  for (const [candidate, votesFor] of counts) {
    if (votesFor > count) {
      winner = candidate;
      count = votesFor;
    }
  }
  const agreement = count / votes.length;
  const confidence = votes.reduce((total, vote) => total + vote.confidence, 0) / votes.length;
  return {
    winner,
    agreement,
    confidence,
    accepted: winner !== "tie" && agreement >= AGREEMENT_THRESHOLD,
  };
}

/** Runs the whole panel. A juror that never answers is dropped, not guessed. */
export async function runJury(spec: PreferenceSpec, options: JuryOptions = {}): Promise<JuryResult> {
  if (!juryConfigured()) throw new Error("no preference jury is configured");
  const panel = configuredJurors();
  const recused = panel
    .filter((juror) => spec.sourceFamily !== null && juror.family === spec.sourceFamily)
    .map((juror) => juror.family);
  const sitting = panel.filter((juror) => !recused.includes(juror.family));
  if (sitting.length === 0) throw new Error("every juror recused itself from this pair");

  const settled = await Promise.allSettled(
    sitting.map((juror) => judgeWithJuror(juror, spec, options)),
  );
  const votes: JurorVote[] = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") votes.push(outcome.value);
    else log.warn("juror dropped from panel", { juror: sitting[index].model });
  }
  return { ...aggregateVotes(votes), votes, recused };
}

/**
 * Records the pair. Unique per job, so a re-run of the same job cannot append
 * a second copy of the verdict.
 */
export async function persistPreferencePair(
  jobId: string,
  assetId: string,
  spec: PreferenceSpec,
  result: JuryResult,
  q: Queryable = db,
): Promise<void> {
  if (result.winner === "tie") throw new Error("cannot persist a tied preference pair");
  const chosen = result.winner === "a" ? spec.a : spec.b;
  const rejected = result.winner === "a" ? spec.b : spec.a;
  await q.query(
    `INSERT INTO preference_pair
       (prompt, chosen, rejected, confidence, jurors, asset_id, trace_asset_id, job_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO NOTHING`,
    [
      spec.prompt,
      chosen,
      rejected,
      result.confidence,
      JSON.stringify({
        agreement: result.agreement,
        recused: result.recused,
        votes: result.votes,
      }),
      assetId,
      spec.traceAssetId,
      jobId,
    ],
  );
}

async function runPreferenceJob(context: JobContext): Promise<void> {
  const spec = validatePreferenceSpec(context.spec);
  const result = await runJury(spec, { fetchImpl: context.fetchImpl });
  if (!result.accepted) {
    // Indecisive juries are left for a human rather than trained on.
    log.info("preference pair needs review", {
      assetId: context.assetId,
      winner: result.winner,
      agreement: result.agreement,
    });
    return;
  }
  await persistPreferencePair(context.jobId, context.assetId, spec, result, context.q);
}

/** Identity of a pair: the same prompt and candidates, in either order. */
export async function preferenceFingerprint(spec: PreferenceSpec): Promise<string> {
  const candidates = [spec.a, spec.b].sort();
  return stripHexPrefix(await sha256Canonical({ prompt: spec.prompt, candidates }));
}

/**
 * Queues a pairwise-preference job for one asset.
 *
 * Deliberately not `enqueueJob`: the registry dedupes per (asset, job_type)
 * because for tier 1 and tier 2 the spec describes the asset, whereas here the
 * spec *is* the unit of work — one asset can carry many distinct pairs, and
 * dropping the second one would silently lose it. Idempotency is therefore per
 * pair, keyed on a fingerprint recorded in the spec.
 */
export async function enqueuePreferenceJob(
  assetId: string,
  spec: { prompt: string; a: string; b: string; sourceFamily?: string; traceAssetId?: string },
  q: Queryable = db,
): Promise<"queued" | "awaiting_model"> {
  const parsed = validatePreferenceSpec(spec);
  const fingerprint = await preferenceFingerprint(parsed);
  const state = juryConfigured() ? "queued" : "awaiting_model";
  const existing = await q.query<{ id: string }>(
    `SELECT id FROM label_job
     WHERE asset_id = $1 AND job_type = $2
       AND state IN ('awaiting_model', 'queued', 'running')
       AND spec->>'fingerprint' = $3`,
    [assetId, PREFERENCE_JOB_TYPE, fingerprint],
  );
  if (existing.rows.length === 0) {
    await q.query(
      `INSERT INTO label_job (asset_id, tier, job_type, state, spec)
       VALUES ($1, 2, $2, $3, $4::jsonb)`,
      [assetId, PREFERENCE_JOB_TYPE, state, JSON.stringify({ ...parsed, fingerprint })],
    );
  } else if (state === "queued") {
    // A jury has been configured since the job was parked.
    await q.query(
      "UPDATE label_job SET state = 'queued', updated_at = now() WHERE id = $1 AND state = 'awaiting_model'",
      [existing.rows[0].id],
    );
  }
  return state;
}

/** Idempotent: safe to call from any entrypoint that needs the job type. */
export function registerPreferenceJobType(): void {
  if (getJobType(PREFERENCE_JOB_TYPE)) return;
  registerJobType({
    name: PREFERENCE_JOB_TYPE,
    tier: 2,
    isConfigured: juryConfigured,
    modelId: () => JURY_MODELS().join(",") || null,
    run: runPreferenceJob,
  });
}

registerPreferenceJobType();
