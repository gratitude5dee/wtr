/**
 * Canonical JSON + SHA-256 helpers.
 *
 * Every hash WTR commits to (the trace `initial_metadata_root`, each
 * `metadata_root`, the content-addressed PIL terms URIs) is a SHA-256 over the
 * canonical serialisation produced here, so the same logical document always
 * hashes identically regardless of key insertion order.
 */

/** Deterministic JSON: object keys sorted, `undefined` normalised, no incidental whitespace. */
export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`).join(",")}}`;
}

export function toHexDigest(digest: ArrayBuffer): `0x${string}` {
  return `0x${Buffer.from(digest).toString("hex")}` as `0x${string}`;
}

/** SHA-256 of raw bytes, as a `0x`-prefixed hex string. */
export async function sha256Bytes(bytes: Uint8Array): Promise<`0x${string}`> {
  const view = new Uint8Array(bytes);
  return toHexDigest(await crypto.subtle.digest("SHA-256", view));
}

/** SHA-256 over the canonical serialisation of `value`. */
export async function sha256Canonical(value: unknown): Promise<`0x${string}`> {
  return sha256Bytes(new TextEncoder().encode(canonicalStringify(value)));
}

/** Hex digest without the `0x` prefix — used where a bare hash is expected (content-addressed URIs). */
export function stripHexPrefix(hash: `0x${string}`): string {
  return hash.slice(2);
}
