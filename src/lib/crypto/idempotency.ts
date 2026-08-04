// Deterministic idempotency keys for wallet / provider actions.
// Ported from universalai-studio-70 (`src/lib/web3/idempotency.ts`).
// Goal: same semantic action in a short time window => same key; different action => different key.

import { canonicalStringify } from "./canonical";

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createIdempotencyKey(
  payload: Record<string, unknown>,
  opts?: { windowSeconds?: number; now?: number },
): Promise<string> {
  const windowSeconds = opts?.windowSeconds ?? 600;
  const bucket = Math.floor((opts?.now ?? Date.now()) / (windowSeconds * 1000));

  const raw = canonicalStringify({ ...payload, bucket, v: 1 });
  const data = new TextEncoder().encode(raw);

  const digest = await crypto.subtle.digest("SHA-256", data);
  const key = toBase64Url(new Uint8Array(digest));

  // Minimum length for our own validation / storage keys.
  return key.length >= 24 ? key : `${key}${"0".repeat(24 - key.length)}`;
}
