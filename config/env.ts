/**
 * Process configuration. Secrets are read here and never logged, echoed or
 * persisted (goal.md §12).
 */
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const DATABASE_URL = () => required("DATABASE_URL");

/** Hex private key of the WTR operator wallet. Never log, never persist. */
export const WALLET_PRIVATE_KEY = () => {
  const key = required("WTR_WALLET_PRIVATE_KEY");
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
};

/** Trace provider staging base URL (goal.md §5). */
export const TRACE_BASE_URL = () =>
  optional("WTR_TRACE_BASE_URL", "https://staging-api.storyprotocol.net");

/** Trace provider API key — sent as `X-API-Key`. Blocked-on Q1. */
export const TRACE_API_KEY = () => required("WTR_TRACE_API_KEY");

/**
 * `live` calls the real Trace API and requires `WTR_TRACE_API_KEY`; `mock`
 * simulates the documented endpoints in-process (WTR is on the provider
 * waitlist). Defaults to `live` when a key is configured, `mock` otherwise.
 */
export const TRACE_MODE = (): "live" | "mock" => {
  const mode = process.env.WTR_TRACE_MODE;
  if (mode === "live" || mode === "mock") return mode;
  return process.env.WTR_TRACE_API_KEY ? "live" : "mock";
};

/** Provider slug sent as `X-Provider`. */
export const TRACE_PROVIDER = () => optional("WTR_TRACE_PROVIDER", "wtr");

/**
 * Attestation of trace-v1.0 payloads. `WTR_TRACE_ATTESTATION_KEY_ID` alone
 * turns the `attestation` block on (hash + key id, unsigned — enough for
 * staging); adding the private key makes the signature real. The key is read
 * here and never logged or persisted (goal.md §12).
 */
export const TRACE_ATTESTATION_KEY_ID = () => process.env.WTR_TRACE_ATTESTATION_KEY_ID || null;
export const TRACE_ATTESTATION_KEY_URL = () => process.env.WTR_TRACE_ATTESTATION_KEY_URL || null;
export const TRACE_ATTESTATION_KEY = () => {
  const key = process.env.WTR_TRACE_ATTESTATION_KEY;
  if (!key) return null;
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
};

/** Legal entity behind the platform, reported as `app.legal_entity`. */
export const TRACE_LEGAL_ENTITY = () => optional("WTR_TRACE_LEGAL_ENTITY", "WTR");

/**
 * Story-API REST base URL used by `@piplabs/cdr-sdk` to read DKG partial
 * decryptions (the CDR read path). This is NOT the EVM JSON-RPC endpoint.
 */
export const CDR_API_URL = () => optional("WTR_CDR_API_URL", "http://172.192.41.96:1317");

/** IPFS HTTP API + gateway used by the CDR storage provider. */
export const IPFS_API_URL = () => optional("WTR_IPFS_API_URL", "http://127.0.0.1:5001");
export const IPFS_GATEWAY_URL = () =>
  optional("WTR_IPFS_GATEWAY_URL", "https://ipfs.io/ipfs");

/**
 * Base URI under which the off-chain PIL terms JSON documents are published.
 * Terms are content-addressed: `${PIL_TERMS_BASE_URI}/${sha256}.json`.
 */
export const PIL_TERMS_BASE_URI = () =>
  optional("WTR_PIL_TERMS_BASE_URI", "https://ipfs.io/ipfs");

export const LOG_LEVEL = () => optional("WTR_LOG_LEVEL", "info");

/**
 * HMAC key for wallet session cookies. Optional in development: without it
 * the dashboard falls back to the single dev creator and shows no login.
 * Empty counts as unset — an empty HMAC key would make cookies forgeable.
 */
export const SESSION_SECRET = () => process.env.WTR_SESSION_SECRET || null;

/**
 * anon_id of a seeded demo creator shown to signed-out visitors. When set,
 * the dashboard renders this creator's (clearly demo) data instead of asking
 * for sign-in; signing in with a wallet always takes precedence.
 */
export const DEMO_CREATOR = () => process.env.WTR_DEMO_CREATOR || null;

/** thirdweb client id (public). Wallet login needs this plus the secret above. */
export const THIRDWEB_CLIENT_ID = () => process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || null;

/** Domain shown in (and verified against) the SIWE payload. */
export const AUTH_DOMAIN = () => optional("WTR_AUTH_DOMAIN", "localhost:3000");

/** Where server-held ciphertext and public previews live on disk. */
export const MEDIA_DIR = () => optional("WTR_MEDIA_DIR", "var/media");

// Tier-2 semantic labeling (goal.md P0-3). Unset key/model = tier 2 off:
// jobs are recorded as awaiting_model instead of inventing labels.
export const TIER2_API_URL = () => optional("WTR_TIER2_API_URL", "https://api.openai.com/v1");
export const TIER2_API_KEY = () => process.env.WTR_TIER2_API_KEY ?? "";
export const TIER2_MODEL = () => process.env.WTR_TIER2_MODEL ?? "";

// DPO / pairwise-preference jury. One OpenAI-compatible endpoint, one juror
// per model id in WTR_JURY_MODELS (comma separated). Falls back to the tier-2
// provider so a single configured endpoint powers both. No models configured =
// jury off: jobs are parked as awaiting_model rather than inventing a winner.
export const JURY_API_URL = () => process.env.WTR_JURY_API_URL ?? TIER2_API_URL();
export const JURY_API_KEY = () => process.env.WTR_JURY_API_KEY ?? TIER2_API_KEY();
export const JURY_MODELS = (): string[] =>
  (process.env.WTR_JURY_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0);

/** Model labels below this confidence are surfaced for creator confirmation. */
export const LABEL_CONFIRM_THRESHOLD = (): number => {
  const raw = Number(process.env.WTR_LABEL_CONFIRM_THRESHOLD ?? "0.8");
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.8;
};
