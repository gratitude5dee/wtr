/**
 * Tier-1 auto-labeling: deterministic, intrinsic properties only — no ML, no
 * inference. Two sources feed it:
 *   - the server derives what it can from the upload record (modality,
 *     format, media type, byte size);
 *   - the browser measures what only the plaintext can answer (duration,
 *     pixel dimensions), because the original never reaches WTR servers.
 * Everything lands as source='model' with confidence 1.0, and never
 * overwrites a label the creator already touched.
 */
import { db, type Queryable } from "../db/pool";
import type { LabelInput } from "../pipeline/store";
import type { Modality } from "../upload/modality";
import { HASH64_HEX } from "./perceptual-hash";

export const TIER1_NAMESPACE = "wtr";

export function serverTier1Labels(input: {
  filename: string;
  mimeType: string;
  modality: Modality;
  byteSize: number;
}): LabelInput[] {
  const extension = input.filename.includes(".")
    ? (input.filename.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const labels: LabelInput[] = [
    { namespace: TIER1_NAMESPACE, key: "modality", value: input.modality, source: "model", confidence: 1 },
    { namespace: TIER1_NAMESPACE, key: "media_type", value: input.mimeType, source: "model", confidence: 1 },
    { namespace: TIER1_NAMESPACE, key: "byte_size", value: input.byteSize, source: "model", confidence: 1 },
  ];
  if (extension) {
    labels.push({
      namespace: TIER1_NAMESPACE,
      key: "format",
      value: extension,
      source: "model",
      confidence: 1,
    });
  }
  return labels;
}

/**
 * Browser-measured intrinsic properties. Strict allowlist: anything else in
 * the payload is rejected, and each value must be a finite number in a sane
 * range — measurements come from the client and are not trusted blindly.
 */
const MEASURED_KEYS: Record<string, { min: number; max: number; integer: boolean }> = {
  duration_s: { min: 0, max: 60 * 60 * 24, integer: false },
  width: { min: 1, max: 1_000_000, integer: true },
  height: { min: 1, max: 1_000_000, integer: true },
};

/** 64-bit perceptual hashes, sent as 16 lowercase hex characters. */
const HASH_KEYS = new Set(["ahash64", "dhash64", "phash64"]);

/**
 * When the content was captured, as reported by the file's own modification
 * time. Normalised to an ISO-8601 UTC instant and never allowed to be in the
 * future, so a wrong device clock cannot invent a capture moment.
 */
const CAPTURED_AT_KEY = "captured_at";

/** Bad input, safe to echo to the caller. */
export class MeasuredLabelError extends Error {}

export function validateMeasuredLabels(payload: unknown): LabelInput[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new MeasuredLabelError("expected an object of measurements");
  }
  const labels: LabelInput[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (HASH_KEYS.has(key)) {
      if (typeof value !== "string" || !HASH64_HEX.test(value)) {
        throw new MeasuredLabelError(`'${key}' must be 16 lowercase hex characters`);
      }
      labels.push({
        namespace: TIER1_NAMESPACE,
        key,
        value,
        source: "model",
        confidence: 1,
      });
      continue;
    }
    if (key === CAPTURED_AT_KEY) {
      const captured = typeof value === "string" ? new Date(value) : new Date(NaN);
      if (Number.isNaN(captured.getTime())) {
        throw new MeasuredLabelError(`'${key}' must be an ISO-8601 timestamp`);
      }
      if (captured.getTime() > Date.now()) {
        throw new MeasuredLabelError(`'${key}' must not be in the future`);
      }
      labels.push({
        namespace: TIER1_NAMESPACE,
        key,
        value: captured.toISOString(),
        source: "model",
        confidence: 1,
      });
      continue;
    }
    // Own-property check: a plain index would resolve inherited names like
    // 'toString' (and JSON.parse produces own '__proto__' keys) to truthy
    // values, silently bypassing the allowlist.
    const rule = Object.prototype.hasOwnProperty.call(MEASURED_KEYS, key)
      ? MEASURED_KEYS[key]
      : undefined;
    if (!rule) throw new MeasuredLabelError(`unknown measurement '${key}'`);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new MeasuredLabelError(`'${key}' must be a finite number`);
    }
    if (rule.integer && !Number.isInteger(value)) {
      throw new MeasuredLabelError(`'${key}' must be an integer`);
    }
    if (value < rule.min || value > rule.max) {
      throw new MeasuredLabelError(`'${key}' is out of range`);
    }
    labels.push({
      namespace: TIER1_NAMESPACE,
      key,
      value: rule.integer ? value : Math.round(value * 1000) / 1000,
      source: "model",
      confidence: 1,
    });
  }
  if (labels.length === 0) throw new MeasuredLabelError("no measurements provided");
  return labels;
}

/**
 * Inserts tier-1 labels without clobbering anything a human already wrote:
 * ON CONFLICT DO NOTHING, so a creator correction always wins.
 */
export async function applyTier1Labels(
  assetId: string,
  labels: readonly LabelInput[],
  q: Queryable = db,
): Promise<void> {
  for (const label of labels) {
    await q.query(
      `INSERT INTO asset_label (asset_id, namespace, key, value, source, confidence, model_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       ON CONFLICT (asset_id, namespace, key) DO NOTHING`,
      [
        assetId,
        label.namespace,
        label.key,
        JSON.stringify(label.value),
        label.source,
        label.confidence ?? null,
        label.modelId ?? null,
      ],
    );
  }
}
