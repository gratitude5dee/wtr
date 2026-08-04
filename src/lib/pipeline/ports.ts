/**
 * The network boundaries a stage handler is allowed to touch.
 *
 * Handlers depend only on these interfaces, which is what makes them pure with
 * respect to I/O: the failure-path tests substitute ports that drop the
 * connection mid-transaction (goal.md §12 — "write the failure path first").
 */
import type { LicensePreset } from "../story/license-presets";
import type { TraceDocument } from "../trace/schema";

/** Stage 3a — encrypt client-side, upload to storage, seal the key in an owner-gated vault. */
export interface MediaPort {
  /** Plaintext bytes of the asset, read from local disk in phase 1. */
  readPlaintext(params: { assetId: string; filename: string }): Promise<Uint8Array>;
  /**
   * Encrypts client-side and uploads via `uploader.uploadFile()`.
   * NEVER `uploadCDR()` — vault payloads are capped at 1024 bytes on-chain, so
   * media cannot go in a vault; only its CID + key can.
   */
  uploadEncrypted(params: {
    content: Uint8Array;
    owner: `0x${string}`;
  }): Promise<{ cid: string; vaultUuid: number; allocateTxHash: `0x${string}`; writeTxHash: `0x${string}` }>;
}

/** Stage 3b — Trace registration and (subset-only) metadata updates. */
export interface TracePort {
  registerData(params: {
    document: TraceDocument;
    batchId: string;
  }): Promise<{ dataId: string; initialMetadataRoot: `0x${string}` }>;
  updateMetadata(params: {
    dataId: string;
    document: TraceDocument;
    prevMetadataRoot: `0x${string}`;
    updateCount: number;
    batchId: string;
  }): Promise<{ metadataRoot: `0x${string}`; updateCount: number }>;
}

/** Stage 3c — Story IP registration against WTR's own SPG collection. */
export interface StoryPort {
  registerIpAsset(params: {
    spgNftContract: `0x${string}`;
    licenseTermsId: bigint;
    licensePreset: LicensePreset;
    ipMetadata: {
      ipMetadataURI: string;
      ipMetadataHash: `0x${string}`;
      nftMetadataURI: string;
      nftMetadataHash: `0x${string}`;
    };
  }): Promise<{ ipId: `0x${string}`; tokenId: bigint; txHash: `0x${string}` }>;
  /** Publishes a JSON document at its content-addressed URI. */
  publishDocument(params: { body: string; sha256: string }): Promise<{ uri: string }>;
}

/** Stage 3d — CDR vault gated on holding a license token for the freshly minted `ipId`. */
export interface CdrPort {
  /** Reads back the owner-gated media vault payload (`{cid, key}`) so it can be re-sealed. */
  readOwnerVault(params: { vaultUuid: number }): Promise<Uint8Array>;
  /**
   * Allocates the license-gated vault. `readConditionData` encodes
   * `(LICENSE_TOKEN, ipId)`, which is why `ipId` must already exist.
   */
  allocateLicenseVault(params: {
    ipId: `0x${string}`;
    owner: `0x${string}`;
    payload: Uint8Array;
  }): Promise<{ vaultUuid: number; allocateTxHash: `0x${string}`; writeTxHash: `0x${string}` }>;
}

/** Stage 5 — settlement side of the license mint. */
export interface SettlementPort {
  /** Live read; fees are never hardcoded (goal.md §12). */
  predictMintingFeeWei(params: { ipId: `0x${string}`; licenseTermsId: bigint }): Promise<bigint>;
  mintLicenseTokens(params: {
    ipId: `0x${string}`;
    licenseTermsId: bigint;
    amount: number;
    maxMintingFeeWei: bigint;
    receiver?: `0x${string}`;
  }): Promise<{ licenseTokenIds: bigint[]; txHash: `0x${string}` }>;
}

export interface Ports {
  media: MediaPort;
  trace: TracePort;
  story: StoryPort;
  cdr: CdrPort;
  settlement: SettlementPort;
}
