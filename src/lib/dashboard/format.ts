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

export const STAGE_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  IN_TRAY: "outline",
  LABELED: "secondary",
  REGISTERED: "secondary",
  LISTED: "default",
  SOLD: "default",
  SETTLED: "default",
  FAILED_REGISTER: "destructive",
};

/** Event log types in the creator's words, not ours. */
export const EVENT_LABEL: Record<string, string> = {
  INGESTED: "Added to your tray",
  LABELS_PROPOSED: "Labels suggested",
  LABELS_CONFIRMED: "Labels confirmed",
  MEDIA_ENCRYPTED_UPLOADED: "Encrypted and stored",
  TRACE_REGISTERED: "Provenance recorded",
  IP_REGISTERED: "Rights registered on-chain",
  CDR_VAULT_ALLOCATED: "Access gate created",
  REGISTER_FAILED: "Registration hit an error",
  LISTED: "Listed for sale",
  LICENSE_MINTED: "A buyer licensed this",
  SALE_RECORDED: "Sale recorded",
  PAYMENT_CREDITED: "Payment credited",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] ?? eventType.toLowerCase().replaceAll("_", " ");
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
