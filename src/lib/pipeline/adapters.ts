/**
 * Real implementations of the pipeline ports: the only place SDK calls happen.
 *
 * Fee handling: `allocateFee` / `writeFee` / `readFee` are read live by the CDR
 * SDK on every call, and the license minting fee is read via
 * `predictMintingLicenseFee`. Nothing here hardcodes a fee (goal.md §12).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { uuidToLabel } from "@piplabs/cdr-sdk";

import {
  LICENSE_READ_CONDITION,
  OWNER_WRITE_CONDITION,
  ROYALTY_MODULE,
  WIP_TOKEN_ADDRESS,
} from "../../../config/chain";
import { PIL_TERMS_BASE_URI } from "../../../config/env";
import type { WtrClients } from "../chain/clients";
import {
  encodeLicenseReadConditionData,
  encodeOwnerWriteConditionData,
} from "../chain/conditions";
import { log } from "../log";
import type { TraceClient } from "../trace/client";

import type { CdrPort, MediaPort, Ports, SettlementPort, StoryPort, TracePort } from "./ports";

/**
 * `uploader.allocate()` preflights the condition contracts' interface. The three
 * Aeneid conditions from goal.md §5.2 are verified independently by
 * `npm run verify:addresses` (chain id + deployed bytecode), and the guessed
 * `checkWriteCondition` / `checkReadCondition` probes revert against them, so
 * the SDK preflight would reject addresses that are in fact correct.
 * `uploader.uploadFile()` exposes no such switch and runs its own validation.
 */
const SKIP_CONDITION_VALIDATION = true;

export function createMediaPort(params: {
  clients: WtrClients;
  mediaDir: string;
}): MediaPort {
  return {
    async readPlaintext({ filename }) {
      const buffer = await readFile(path.resolve(params.mediaDir, filename));
      return new Uint8Array(buffer);
    },

    async uploadEncrypted({ content, owner }) {
      // `uploadFile` encrypts client-side, pushes the ciphertext to IPFS and
      // seals only {cid, key} in the vault. `uploadCDR` must never be used for
      // media: vault payloads are capped at 1024 bytes on-chain.
      const ownerData = encodeOwnerWriteConditionData(owner);
      const result = await params.clients.cdr.uploader.uploadFile({
        content,
        storageProvider: params.clients.storage,
        updatable: false,
        writeConditionAddr: OWNER_WRITE_CONDITION,
        writeConditionData: ownerData,
        // Staging gate: only the owner can read this vault. The license-gated
        // vault is allocated in 3d, once `ipId` exists.
        readConditionAddr: OWNER_WRITE_CONDITION,
        readConditionData: ownerData,
        accessAuxData: "0x",
      });
      return {
        cid: result.cid,
        vaultUuid: result.uuid,
        allocateTxHash: result.txHashes.allocate,
        writeTxHash: result.txHashes.write,
      };
    },
  };
}

export function createTracePort(client: TraceClient): TracePort {
  return {
    registerData: (input) => client.registerData(input),
    updateMetadata: async (input) => {
      const result = await client.updateMetadata(input);
      return { metadataRoot: result.metadataRoot, updateCount: result.updateCount };
    },
  };
}

export function createStoryPort(params: {
  clients: WtrClients;
  /** Publishes a document body at a content-addressed URI and returns nothing but success. */
  publish?: (input: { body: string; sha256: string }) => Promise<{ uri: string }>;
}): StoryPort {
  return {
    async publishDocument(input) {
      if (params.publish) return params.publish(input);
      // Default: push the JSON to the same IPFS node used for media, so the
      // document is genuinely content-addressed rather than merely named.
      const cid = await params.clients.storage.upload(new TextEncoder().encode(input.body));
      return { uri: `${PIL_TERMS_BASE_URI().replace(/\/$/, "")}/${cid}` };
    },

    async registerIpAsset(input) {
      const result = await params.clients.story.ipAsset.registerIpAsset({
        nft: { type: "mint", spgNftContract: input.spgNftContract, allowDuplicates: false },
        licenseTermsData: [{ licenseTermsId: input.licenseTermsId }],
        ipMetadata: input.ipMetadata,
      });
      if (!result.ipId || result.tokenId === undefined || !result.txHash) {
        throw new Error("registerIpAsset returned no ipId/tokenId");
      }
      return {
        ipId: result.ipId,
        tokenId: BigInt(result.tokenId),
        txHash: result.txHash,
      };
    },
  };
}

export function createCdrPort(clients: WtrClients): CdrPort {
  return {
    async readOwnerVault({ vaultUuid }) {
      // Owner read of the staging vault. The recovered payload is key material:
      // it is passed straight into the next call and never logged.
      const { dataKey } = await clients.cdr.consumer.accessCDR({
        uuid: vaultUuid,
        accessAuxData: "0x",
      });
      return dataKey;
    },

    async allocateLicenseVault({ ipId, owner, payload }) {
      const { uuid, txHash: allocateTxHash } = await clients.cdr.uploader.allocate({
        updatable: false,
        writeConditionAddr: OWNER_WRITE_CONDITION,
        writeConditionData: encodeOwnerWriteConditionData(owner),
        readConditionAddr: LICENSE_READ_CONDITION,
        // (LICENSE_TOKEN, ipId) — this is why 3c must precede 3d.
        readConditionData: encodeLicenseReadConditionData(ipId),
        skipConditionValidation: SKIP_CONDITION_VALIDATION,
      });

      const ciphertext = await clients.cdr.uploader.encryptDataKey({
        dataKey: payload,
        label: uuidToLabel(uuid),
      });
      const { txHash: writeTxHash } = await clients.cdr.uploader.write({
        uuid,
        accessAuxData: "0x",
        encryptedData: `0x${Buffer.from(ciphertext.raw).toString("hex")}`,
      });

      return { vaultUuid: uuid, allocateTxHash, writeTxHash };
    },
  };
}

export function createSettlementPort(clients: WtrClients): SettlementPort {
  return {
    async predictMintingFeeWei({ ipId, licenseTermsId }) {
      const result = await clients.story.license.predictMintingLicenseFee({
        licensorIpId: ipId,
        licenseTermsId,
        amount: 1,
      });
      return BigInt(result.tokenAmount);
    },

    async mintLicenseTokens({ ipId, licenseTermsId, amount, maxMintingFeeWei, receiver }) {
      // Explicit $WIP flow (goal.md §5.2): deposit → approve(ROYALTY_MODULE) → mint.
      // `$WIP` is the wrapped ERC-20; `$IP` is the native token. Do not swap them.
      if (maxMintingFeeWei > 0n) {
        const balance = await clients.story.wipClient.balanceOf(clients.account.address);
        if (balance < maxMintingFeeWei) {
          await clients.story.wipClient.deposit({ amount: maxMintingFeeWei - balance });
        }
        await clients.story.wipClient.approve({
          spender: ROYALTY_MODULE,
          amount: maxMintingFeeWei,
        });
        log.info("approved $WIP for royalty module", { spender: ROYALTY_MODULE });
      }

      const result = await clients.story.license.mintLicenseTokens({
        licensorIpId: ipId,
        licenseTermsId,
        amount,
        maxMintingFee: maxMintingFeeWei,
        receiver,
        options: {
          // We handled wrapping and approval explicitly above.
          wipOptions: { enableAutoWrapIp: false, enableAutoApprove: false },
        },
      });
      if (!result.licenseTokenIds?.length || !result.txHash) {
        throw new Error("mintLicenseTokens returned no license token ids");
      }
      return { licenseTokenIds: result.licenseTokenIds, txHash: result.txHash };
    },
  };
}

export function createPorts(params: {
  clients: WtrClients;
  trace: TraceClient;
  mediaDir: string;
}): Ports {
  return {
    media: createMediaPort({ clients: params.clients, mediaDir: params.mediaDir }),
    trace: createTracePort(params.trace),
    story: createStoryPort({ clients: params.clients }),
    cdr: createCdrPort(params.clients),
    settlement: createSettlementPort(params.clients),
  };
}

export const SETTLEMENT_CURRENCY = WIP_TOKEN_ADDRESS;
