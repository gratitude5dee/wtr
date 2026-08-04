/**
 * IPA / NFT metadata documents.
 *
 * The documents are content-addressed exactly like the PIL terms: the SHA-256
 * of the canonical document is both its filename and the `ipMetadataHash` /
 * `nftMetadataHash` committed on-chain.
 */
import { sha256Canonical, stripHexPrefix } from "../crypto/canonical";

import { NO_TRAIN_ROBOT_TERMS, type LicensePreset } from "./license-presets";

export interface IpMetadataDocument {
  title: string;
  description: string;
  mediaType: string;
  /** Hash of the PLAINTEXT bytes — the same value stored on `asset.content_sha256`. */
  mediaHash: string;
  /** Encrypted media location. The plaintext is never published. */
  mediaUrl: string;
  createdAt: string;
  /** Pseudonymous creator reference. Never a name (no PII, goal.md §12). */
  creators: { name: string; contributionPercent: number }[];
  licensePreset: LicensePreset;
  /** Written for WTR-NO-TRAIN so crawlers see the refusal in the IPA metadata. */
  robotTerms?: typeof NO_TRAIN_ROBOT_TERMS;
}

export interface NftMetadataDocument {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
}

export async function contentAddressed<T>(
  document: T,
  baseUri: string,
): Promise<{ uri: string; hash: `0x${string}` }> {
  const hash = await sha256Canonical(document);
  return { uri: `${baseUri.replace(/\/$/, "")}/${stripHexPrefix(hash)}.json`, hash };
}

export function buildIpMetadataDocument(params: {
  title: string;
  description: string;
  mediaType: string;
  contentSha256: string;
  encryptedMediaUrl: string;
  creatorAnonId: string;
  licensePreset: LicensePreset;
  createdAt: Date;
}): IpMetadataDocument {
  return {
    title: params.title,
    description: params.description,
    mediaType: params.mediaType,
    mediaHash: params.contentSha256,
    mediaUrl: params.encryptedMediaUrl,
    createdAt: params.createdAt.toISOString(),
    creators: [{ name: params.creatorAnonId, contributionPercent: 100 }],
    licensePreset: params.licensePreset,
    ...(params.licensePreset === "WTR-NO-TRAIN" ? { robotTerms: NO_TRAIN_ROBOT_TERMS } : {}),
  };
}

export function buildNftMetadataDocument(params: {
  title: string;
  description: string;
  imageUrl: string;
  licensePreset: LicensePreset;
  contentSha256: string;
}): NftMetadataDocument {
  return {
    name: params.title,
    description: params.description,
    image: params.imageUrl,
    attributes: [
      { trait_type: "License", value: params.licensePreset },
      { trait_type: "Content SHA-256", value: params.contentSha256 },
    ],
  };
}
