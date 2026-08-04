/**
 * The three WTR license presets (goal.md §5.4).
 *
 * Each preset has two halves:
 *  - an off-chain PIL terms JSON document, published at a content-addressed URI
 *    (`<base>/<sha256>.json`) and referenced by the on-chain terms' `uri`;
 *  - on-chain `LicenseTerms`, registered once as a `licenseTermsId` and reused.
 *
 * `aiLearningModels` is the field that matters: `true` for both TRAIN presets,
 * `false` for WTR-NO-TRAIN, which additionally publishes `robotTerms` into the
 * IPA metadata so crawlers see the refusal without reading the license.
 */
import type { LicenseTermsInput } from "@story-protocol/core-sdk";

import { WIP_TOKEN_ADDRESS, ZERO_ADDRESS } from "../../../config/chain";
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";

export const LICENSE_PRESETS = [
  "WTR-TRAIN-EXCLUSIVE",
  "WTR-TRAIN-NONEXCLUSIVE",
  "WTR-NO-TRAIN",
] as const;

export type LicensePreset = (typeof LICENSE_PRESETS)[number];

/** IPA metadata `robotTerms` for WTR-NO-TRAIN: crawlers are refused outright. */
export const NO_TRAIN_ROBOT_TERMS = { userAgent: "*", allow: "" } as const;

export interface PilTermsDocument {
  name: LicensePreset;
  version: "1.0";
  /** The knob that decides whether the data may train a model. */
  aiLearningModels: boolean;
  exclusive: boolean;
  commercialUse: boolean;
  derivativesAllowed: boolean;
  transferable: boolean;
  territory: "worldwide";
  summary: string;
  /** Present only on WTR-NO-TRAIN. Mirrored into IPA metadata. */
  robotTerms?: typeof NO_TRAIN_ROBOT_TERMS;
}

const DOCUMENTS: Record<LicensePreset, PilTermsDocument> = {
  "WTR-TRAIN-EXCLUSIVE": {
    name: "WTR-TRAIN-EXCLUSIVE",
    version: "1.0",
    aiLearningModels: true,
    exclusive: true,
    commercialUse: true,
    derivativesAllowed: false,
    // Exclusivity is meaningless if the licensee can pass the license on.
    transferable: false,
    territory: "worldwide",
    summary:
      "Exclusive right to use the licensed data for training AI/ML models, commercially, worldwide. Non-transferable; no derivative licensing.",
  },
  "WTR-TRAIN-NONEXCLUSIVE": {
    name: "WTR-TRAIN-NONEXCLUSIVE",
    version: "1.0",
    aiLearningModels: true,
    exclusive: false,
    commercialUse: true,
    derivativesAllowed: false,
    transferable: true,
    territory: "worldwide",
    summary:
      "Non-exclusive right to use the licensed data for training AI/ML models, commercially, worldwide.",
  },
  "WTR-NO-TRAIN": {
    name: "WTR-NO-TRAIN",
    version: "1.0",
    aiLearningModels: false,
    exclusive: false,
    commercialUse: true,
    derivativesAllowed: false,
    transferable: true,
    territory: "worldwide",
    summary:
      "Commercial use of the licensed data is permitted, but training or fine-tuning AI/ML models on it is NOT.",
    robotTerms: NO_TRAIN_ROBOT_TERMS,
  },
};

export function termsDocument(preset: LicensePreset): PilTermsDocument {
  return DOCUMENTS[preset];
}

/** Content-addressed location of a terms document: the hash IS the identity. */
export async function termsDocumentLocation(
  preset: LicensePreset,
  baseUri: string,
): Promise<{ sha256: string; uri: string; body: string }> {
  const document = termsDocument(preset);
  const sha256 = stripHexPrefix(await sha256Canonical(document));
  return {
    sha256,
    uri: `${baseUri.replace(/\/$/, "")}/${sha256}.json`,
    body: JSON.stringify(document, null, 2),
  };
}

/**
 * On-chain terms for a preset.
 *
 * `royaltyPolicy` is deliberately omitted so the SDK applies the LAP default,
 * and `defaultMintingFee` is a caller-supplied wei amount — never a literal.
 */
export function licenseTerms(params: {
  preset: LicensePreset;
  uri: string;
  defaultMintingFeeWei: bigint;
  commercialRevSharePercent: number;
}): LicenseTermsInput {
  const document = termsDocument(params.preset);
  return {
    transferable: document.transferable,
    defaultMintingFee: params.defaultMintingFeeWei,
    expiration: 0n,
    commercialUse: document.commercialUse,
    commercialAttribution: true,
    commercializerChecker: ZERO_ADDRESS,
    commercializerCheckerData: ZERO_ADDRESS,
    commercialRevShare: params.commercialRevSharePercent,
    commercialRevCeiling: 0n,
    derivativesAllowed: document.derivativesAllowed,
    derivativesAttribution: document.derivativesAllowed,
    derivativesApproval: false,
    derivativesReciprocal: false,
    derivativeRevCeiling: 0n,
    currency: WIP_TOKEN_ADDRESS,
    uri: params.uri,
  };
}
