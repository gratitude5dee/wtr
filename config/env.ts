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

/** Provider slug sent as `X-Provider`. */
export const TRACE_PROVIDER = () => optional("WTR_TRACE_PROVIDER", "wtr");

/**
 * Story-API REST base URL used by `@piplabs/cdr-sdk` to read DKG partial
 * decryptions (the CDR read path). This is NOT the EVM JSON-RPC endpoint.
 */
export const CDR_API_URL = () => optional("WTR_CDR_API_URL", "http://127.0.0.1:1317");

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

/** thirdweb client id (public). Wallet login needs this plus the secret above. */
export const THIRDWEB_CLIENT_ID = () => process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || null;

/** Domain shown in (and verified against) the SIWE payload. */
export const AUTH_DOMAIN = () => optional("WTR_AUTH_DOMAIN", "localhost:3000");

/** Where server-held ciphertext and public previews live on disk. */
export const MEDIA_DIR = () => optional("WTR_MEDIA_DIR", "var/media");
