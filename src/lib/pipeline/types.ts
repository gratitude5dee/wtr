/** Pipeline vocabulary (goal.md §11). */

export const STAGES = ["IN_TRAY", "LABELED", "REGISTERED", "LISTED", "SOLD", "SETTLED"] as const;
export type Stage = (typeof STAGES)[number];

/** Terminal-until-retried state for a partially completed stage 3. */
export const FAILED_REGISTER = "FAILED_REGISTER" as const;

export type AssetStage = Stage | typeof FAILED_REGISTER;

/**
 * Event types written to `asset_event`. The log is the source of truth; every
 * stage handler decides what to do by reading these back.
 */
export const EVENT = {
  INGESTED: "asset.ingested",
  LABELED: "asset.labeled",
  MEDIA_ENCRYPTED_UPLOADED: "asset.media_encrypted_uploaded", // 3a
  TRACE_REGISTERED: "asset.trace_registered", // 3b
  IP_REGISTERED: "asset.ip_registered", // 3c
  CDR_VAULT_ALLOCATED: "asset.cdr_vault_allocated", // 3d
  REGISTER_FAILED: "asset.register_failed",
  LISTED: "asset.listed",
  SOLD: "asset.sold",
  PAYOUT_CREDITED: "asset.payout_credited",
  SETTLED: "asset.settled",
  CONSENT_CHANGED: "creator.consent_changed",
  KYC_CHANGED: "creator.kyc_changed",
  LICENSE_CHANGED: "asset.license_changed",
  TAKEDOWN: "asset.takedown",
  DUPLICATE_CLAIM_FLAGGED: "asset.duplicate_claim_flagged",
  SUBMITTED_TO_REQUEST: "asset.submitted_to_request",
  SUBMISSION_WITHDRAWN: "asset.submission_withdrawn",
} as const;

export type EventType = (typeof EVENT)[keyof typeof EVENT];

export interface AssetEvent {
  id?: number;
  assetId: string;
  seq: number;
  eventType: EventType;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  promotedToTrace: boolean;
  traceSeq: number | null;
  createdAt?: Date;
}

/** Projection of the event log — the `asset` spine row. */
export interface AssetRow {
  id: string;
  creatorId: string;
  stage: AssetStage;
  mediaType: string;
  filename: string | null;
  byteSize: number | null;
  contentSha256: string;
  duplicateClaimFlag: boolean;
  ipfsCid: string | null;
  mediaVaultUuid: number | null;
  traceDataId: string | null;
  traceMetadataRoot: string | null;
  traceUpdateCount: number;
  ipId: `0x${string}` | null;
  spgNftContract: `0x${string}` | null;
  nftTokenId: bigint | null;
  licenseTermsId: bigint | null;
  cdrVaultUuid: number | null;
}

/**
 * Uniform result of every stage handler.
 *
 * `skipped` is what makes the handlers idempotent: a handler that finds its
 * work already recorded in the event log returns `skipped` without touching the
 * network.
 */
export interface StageResult {
  stage: AssetStage;
  status: "completed" | "skipped" | "failed";
  /** Sub-steps that this invocation performed (empty when skipped). */
  performed: string[];
  /** Sub-steps that were already recorded before this invocation. */
  alreadyDone: string[];
  assetId: string;
  error?: { name: string; message: string };
}

export type StageHandler = (assetId: string) => Promise<StageResult>;
