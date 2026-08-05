/**
 * Plain-language rendering for the dashboard (goal.md §8.4): the creator sees
 * words and links, never enum values or raw license IDs.
 */
import { EXPLORER_URL, NATIVE_CURRENCY } from "../../../config/chain";
import { IPFS_GATEWAY_URL } from "../../../config/env";
import { formatWei } from "../money";

export const STAGE_LABEL: Record<string, string> = {
  IN_TRAY: "In tray",
  LABELED: "Labeled",
  REGISTERED: "Registered",
  LISTED: "Listed",
  SOLD: "Sold",
  SETTLED: "Settled",
  FAILED_REGISTER: "Registration failed",
};

/** Signal-tinted badge classes per stage (exchange design: dim fill, tinted text). */
export const STAGE_TINT: Record<string, string> = {
  IN_TRAY: "border-border bg-transparent text-muted-foreground",
  LABELED: "border-transparent bg-[rgb(var(--tint-purple)/0.12)] text-[rgb(var(--tint-purple))]",
  REGISTERED: "border-transparent bg-[rgb(var(--tint-blue)/0.12)] text-[rgb(var(--tint-blue))]",
  LISTED: "border-transparent bg-[rgb(var(--tint-green)/0.12)] text-[rgb(var(--tint-green))]",
  SOLD: "border-transparent bg-[rgb(var(--tint-green)/0.12)] text-[rgb(var(--tint-green))]",
  SETTLED: "border-transparent bg-[rgb(var(--tint-green)/0.18)] text-[rgb(var(--tint-green))]",
  FAILED_REGISTER: "border-transparent bg-[rgb(var(--tint-red)/0.12)] text-[rgb(var(--tint-red))]",
};

/** Event log types (pipeline `EVENT` values) in the creator's words, not ours. */
export const EVENT_LABEL: Record<string, string> = {
  "asset.ingested": "Added to your tray",
  "asset.labeled": "Labels confirmed",
  "asset.media_encrypted_uploaded": "Encrypted and stored",
  "asset.trace_registered": "Provenance recorded",
  "asset.ip_registered": "Rights registered on-chain",
  "asset.cdr_vault_allocated": "Access gate created",
  "asset.register_failed": "Registration hit an error",
  "asset.listed": "Listed for sale",
  "asset.sold": "A buyer licensed this",
  "asset.payout_credited": "Payment credited",
  "asset.settled": "Settled",
  "asset.license_changed": "License changed",
  "asset.takedown": "Withdrawn from sale",
  "asset.duplicate_claim_flagged": "Duplicate claim raised for review",
  "asset.submitted_to_request": "Submitted to a lab request",
  "asset.submission_withdrawn": "Submission withdrawn",
  "asset.submission_accepted": "Submission accepted by the lab",
  "asset.submission_rejected": "Submission declined by the lab",
  "creator.consent_changed": "Consent updated",
  "creator.kyc_changed": "Identity check updated",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] ?? eventType.replace(/^[a-z]+\./, "").replaceAll("_", " ");
}

/** Plain-language license line (goal.md §8.4). Never a licenseTermsId. */
export const PRESET_SENTENCE: Record<string, string> = {
  "WTR-TRAIN-EXCLUSIVE":
    "One lab may train on this, exclusively, for a limited window. They may not remix it.",
  "WTR-TRAIN-NONEXCLUSIVE":
    "Labs may train on this. Many can license it. They may not remix it.",
  "WTR-NO-TRAIN":
    "Labs may reference this but may never train on it. They may not remix it.",
};

export const PRESET_NAME: Record<string, string> = {
  "WTR-TRAIN-EXCLUSIVE": "Train, exclusive window",
  "WTR-TRAIN-NONEXCLUSIVE": "Train, sell to many",
  "WTR-NO-TRAIN": "Reference only, never train",
};

/** Funding state of a lab request, in the creator's words. */
export function fundingLabel(
  fundingMode: string,
  budgetWei: bigint,
  amountPaidWei: bigint,
): string {
  if (fundingMode === "full") return "Fully funded";
  if (fundingMode === "deposit") {
    const pct = budgetWei > 0n ? Number((amountPaidWei * 100n) / budgetWei) : 0;
    return `Funded ${pct}%`;
  }
  return "Unfunded";
}

export function formatIp(amountWei: bigint): string {
  return `${formatWei(amountWei)} ${NATIVE_CURRENCY.symbol}`;
}

export function explorerIpUrl(ipId: string): string {
  return `${EXPLORER_URL}/address/${ipId}`;
}

export function explorerTx(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function ipfsUrl(cid: string): string {
  return `${IPFS_GATEWAY_URL()}/${cid}`;
}

export function shortHash(value: string, edge = 8): string {
  if (value.length <= edge * 2 + 1) return value;
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}
