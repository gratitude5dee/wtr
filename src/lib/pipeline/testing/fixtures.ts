/**
 * Test doubles for the pipeline ports, with a switch to drop the connection
 * mid-transaction at any named call.
 */
import type { StageDeps } from "../deps";
import type { Ports } from "../ports";
import type { LicensePresetRow } from "../store";
import type { AssetRow } from "../types";

import { MemoryAssetStore } from "./memory-store";

/** What a dropped TCP connection looks like to `fetch`/viem. */
export class NetworkDropError extends Error {
  constructor(readonly at: string) {
    super(`socket hang up during ${at}`);
    this.name = "NetworkDropError";
  }
}

export const TEST_OWNER = "0x1111111111111111111111111111111111111111" as const;
export const TEST_SPG = "0x2222222222222222222222222222222222222222" as const;
export const TEST_IP_ID = "0x3333333333333333333333333333333333333333" as const;
const TX = "0x4444444444444444444444444444444444444444444444444444444444444444" as const;

export const TEST_PRESET: LicensePresetRow = {
  preset: "WTR-TRAIN-NONEXCLUSIVE",
  licenseTermsId: 42n,
  termsUri: "ipfs://terms",
  termsSha256: "a".repeat(64),
  aiLearningModels: true,
};

export interface FixtureOptions {
  /** Port call name that should drop the connection, e.g. `"story.registerIpAsset"`. */
  dropAt?: string;
  /** Number of times the drop applies before the call starts succeeding. */
  dropTimes?: number;
  asset?: Partial<AssetRow>;
}

export interface Fixture {
  store: MemoryAssetStore;
  deps: StageDeps;
  /** Every port call in order, for asserting no side effect is repeated. */
  calls: string[];
  /** Turns the fault off, so a retry can succeed. */
  clearFault: () => void;
}

export const PLAINTEXT = new TextEncoder().encode("fake audio bytes");
/** sha256("fake audio bytes"), filled in by `makeFixture`. */
async function contentSha256(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", PLAINTEXT);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function makeFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const calls: string[] = [];
  let dropAt = options.dropAt;
  let dropsLeft = options.dropTimes ?? Number.POSITIVE_INFINITY;

  const guard = (name: string): void => {
    calls.push(name);
    if (dropAt === name && dropsLeft > 0) {
      dropsLeft -= 1;
      throw new NetworkDropError(name);
    }
  };

  const store = new MemoryAssetStore({
    asset: {
      id: "asset-1",
      creatorId: "creator-1",
      stage: "IN_TRAY",
      mediaType: "audio/wav",
      filename: "sample.wav",
      byteSize: PLAINTEXT.byteLength,
      contentSha256: await contentSha256(),
      duplicateClaimFlag: false,
      ipfsCid: null,
      mediaVaultUuid: null,
      traceDataId: null,
      traceMetadataRoot: null,
      traceUpdateCount: 0,
      ipId: null,
      spgNftContract: null,
      nftTokenId: null,
      licenseTermsId: null,
      cdrVaultUuid: null,
      ...options.asset,
    },
    creator: { id: "creator-1", anonId: "anon-abc", kycStatus: "verified" },
    consent: {
      documentVersion: "2026-01",
      documentSha256: "b".repeat(64),
      scopes: { ai_training: true },
      acceptedAt: new Date(0),
    },
    presets: [TEST_PRESET],
    spgNftContract: TEST_SPG,
  });

  const ports: Ports = {
    media: {
      async readPlaintext() {
        guard("media.readPlaintext");
        return PLAINTEXT;
      },
      async uploadEncrypted() {
        guard("media.uploadEncrypted");
        return { cid: "bafyfake", vaultUuid: 1, allocateTxHash: TX, writeTxHash: TX };
      },
    },
    trace: {
      mock: false,
      async registerData() {
        guard("trace.registerData");
        return { dataId: "trace-data-1", initialMetadataRoot: `sha256:${"c".repeat(64)}` as const };
      },
      async updateMetadata({ updateCount }) {
        guard("trace.updateMetadata");
        return { metadataRoot: `sha256:${"d".repeat(64)}` as const, updateCount: updateCount + 1 };
      },
    },
    story: {
      async publishDocument() {
        guard("story.publishDocument");
        return { uri: "ipfs://metadata" };
      },
      async registerIpAsset() {
        guard("story.registerIpAsset");
        return { ipId: TEST_IP_ID, tokenId: 7n, txHash: TX };
      },
    },
    cdr: {
      async readOwnerVault() {
        guard("cdr.readOwnerVault");
        return new Uint8Array([1, 2, 3]);
      },
      async allocateLicenseVault() {
        guard("cdr.allocateLicenseVault");
        return { vaultUuid: 2, allocateTxHash: TX, writeTxHash: TX };
      },
    },
    settlement: {
      async predictMintingFeeWei() {
        guard("settlement.predictMintingFeeWei");
        return 1_000_000_000_000_000n;
      },
      async mintLicenseTokens() {
        guard("settlement.mintLicenseTokens");
        return { licenseTokenIds: [99n], txHash: TX };
      },
    },
  };

  const deps: StageDeps = {
    store,
    ports,
    owner: TEST_OWNER,
    now: () => new Date("2026-02-01T00:00:00.000Z"),
    proposeLabels: async () => [
      { namespace: "wtr", key: "license_preset", value: TEST_PRESET.preset, source: "human" },
      { namespace: "wtr", key: "genre", value: "ambient", source: "model", confidence: 0.9 },
    ],
    quotePriceWei: async () => 5_000_000_000_000_000_000n,
    buyer: { anonId: "anon-buyer" },
    defaultLicensePreset: "WTR-TRAIN-NONEXCLUSIVE",
  };

  return {
    store,
    deps,
    calls,
    clearFault: () => {
      dropAt = undefined;
    },
  };
}
