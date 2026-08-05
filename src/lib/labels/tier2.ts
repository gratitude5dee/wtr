/**
 * Tier-2 semantic labeling (goal.md P0-3): model-generated labels such as
 * genre, mood, subject, style. Labeling is a queued job — upload never blocks
 * on it — and each label persists with source='model', its confidence, and
 * the model_id that produced it.
 *
 * The model only ever sees the degraded public preview: plaintext originals
 * never reach WTR servers, so they can never reach a model provider either.
 * Which models power tier 2 is still an open product question (goal.md §13
 * Q9), so the provider is env-configured and OpenAI-compatible; with no
 * model configured, jobs are honestly recorded as 'awaiting_model' — WTR
 * never invents semantic labels.
 */
import { TIER2_API_KEY, TIER2_API_URL, TIER2_MODEL } from "../../../config/env";
import { db } from "../db/pool";
import { log } from "../log";
import type { LabelInput } from "../pipeline/store";
import { readPreview } from "../upload/preview-store";
import { applyTier1Labels, TIER1_NAMESPACE } from "./tier1";

/** The semantic keys tier 2 may emit; anything else from the model is dropped. */
export const TIER2_KEYS = new Set([
  "genre",
  "mood",
  "instrumentation",
  "stem_type",
  "subject",
  "style",
  "setting",
  "shot_type",
  "named_entities_present",
]);

const MAX_VALUE_CHARS = 80;

export function tier2Configured(): boolean {
  return Boolean(TIER2_API_KEY() && TIER2_MODEL());
}

const PROMPT =
  "You label creative media for a licensing catalog. Given one image, return JSON " +
  '{"labels":[{"key":string,"value":string,"confidence":number}]} using only these keys: ' +
  [...TIER2_KEYS].join(", ") +
  ". confidence is 0..1. Only include keys you can actually judge from the image. " +
  "named_entities_present is 'true' or 'false' for recognizable people, brands, or logos.";

/** Parses and strictly validates a model response into label inputs. */
export function parseTier2Response(raw: string, modelId: string): LabelInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("tier-2 model returned invalid JSON");
  }
  const items =
    typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { labels?: unknown }).labels)
      ? ((parsed as { labels: unknown[] }).labels as unknown[])
      : [];
  const labels: LabelInput[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const { key, value, confidence } = item as Record<string, unknown>;
    if (typeof key !== "string" || !TIER2_KEYS.has(key)) continue;
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_CHARS) continue;
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) continue;
    labels.push({
      namespace: TIER1_NAMESPACE,
      key,
      value,
      source: "model",
      confidence: Math.min(1, Math.max(0, confidence)),
      modelId,
    });
  }
  return labels;
}

/** Calls the OpenAI-compatible vision endpoint on the degraded preview. */
export async function labelPreviewWithModel(
  preview: Uint8Array,
  fetchImpl: typeof fetch = fetch,
): Promise<LabelInput[]> {
  const modelId = TIER2_MODEL();
  const response = await fetchImpl(`${TIER2_API_URL()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TIER2_API_KEY()}`,
    },
    body: JSON.stringify({
      model: modelId,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${Buffer.from(preview).toString("base64")}` },
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`tier-2 model call failed with status ${response.status}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("tier-2 model returned no content");
  return parseTier2Response(content, modelId);
}

/**
 * Records a tier-2 job for the asset. Returns the job state. Idempotent per
 * asset: an existing unfinished job is reused rather than duplicated.
 */
export async function enqueueTier2(assetId: string): Promise<"queued" | "awaiting_model"> {
  const state = tier2Configured() ? "queued" : "awaiting_model";
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM label_job
     WHERE asset_id = $1 AND job_type = 'tier2_vision'
       AND state IN ('awaiting_model', 'queued', 'running')`,
    [assetId],
  );
  if (existing.rows.length === 0) {
    await db.query(
      "INSERT INTO label_job (asset_id, tier, job_type, state) VALUES ($1, 2, 'tier2_vision', $2)",
      [assetId, state],
    );
  } else if (state === "queued") {
    // A model has been configured since the job was parked.
    await db.query(
      `UPDATE label_job SET state = 'queued', updated_at = now()
       WHERE asset_id = $1 AND job_type = 'tier2_vision' AND state = 'awaiting_model'`,
      [assetId],
    );
  }
  return state;
}

/**
 * Runs the queued tier-2 job for one asset. Claims the job row first so
 * concurrent invocations cannot double-label.
 */
export async function runTier2Job(assetId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const claimed = await db.query<{ id: string }>(
    `UPDATE label_job SET state = 'running', model_id = $2, updated_at = now()
     WHERE asset_id = $1 AND job_type = 'tier2_vision' AND state = 'queued'
     RETURNING id`,
    [assetId, TIER2_MODEL()],
  );
  const jobId = claimed.rows[0]?.id;
  if (!jobId) return;

  const finish = (state: "done" | "failed", error: string | null) =>
    db.query("UPDATE label_job SET state = $2, error = $3, updated_at = now() WHERE id = $1", [
      jobId,
      state,
      error,
    ]);

  try {
    const preview = await readPreview(assetId);
    if (!preview) {
      await finish("failed", "no degraded preview available to label");
      return;
    }
    const labels = await labelPreviewWithModel(preview.bytes, fetchImpl);
    await applyTier1Labels(assetId, labels);
    await finish("done", null);
    log.info("tier-2 labeling complete", { assetId, labels: labels.length });
  } catch (error) {
    await finish("failed", (error as Error).message);
    log.warn("tier-2 labeling failed", { assetId });
  }
}
