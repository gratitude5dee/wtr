/**
 * Stage 3 — REGISTERED. Four sub-steps in a STRICT order (goal.md §11):
 *
 *   3a  encrypt client-side + `uploader.uploadFile()`  → ipfs cid + media vault
 *   3b  Trace register                                 → data_id + initial_metadata_root
 *   3c  `client.ipAsset.registerIpAsset(...)`          → ipId
 *   3d  allocate CDR vault, readConditionData = (LICENSE_TOKEN, ipId)
 *
 * 3c MUST precede 3d — the read condition encodes `ipId`, so 3d literally cannot
 * be built before 3c returns. These are never parallelised.
 *
 * Each sub-step short-circuits on its own event, so a failure leaves the asset in
 * FAILED_REGISTER with the completed sub-steps recorded and a retry RESUMES
 * rather than restarting (no duplicate uploads, no duplicate registrations).
 */
import { sha256Bytes, stripHexPrefix } from "../../crypto/canonical";
import { log } from "../../log";
import {
  buildIpMetadataDocument,
  buildNftMetadataDocument,
} from "../../story/ip-metadata";
import type { LicensePreset } from "../../story/license-presets";
import { stableBatchId } from "../../trace/client";
import type { StageDeps } from "../deps";
import { hasEvent, lastEvent } from "../store";
import { buildTraceDocument } from "../trace-document";
import { EVENT, FAILED_REGISTER, type StageHandler, type StageResult } from "../types";

export const REGISTER_SUB_STEPS = ["3a", "3b", "3c", "3d"] as const;
export type RegisterSubStep = (typeof REGISTER_SUB_STEPS)[number];

export function createRegisterHandler(deps: StageDeps): StageHandler {
  return async function register(assetId: string): Promise<StageResult> {
    const asset = await deps.store.getAsset(assetId);
    if (!asset) throw new Error(`Unknown asset ${assetId}`);
    let events = await deps.store.listEvents(assetId);

    if (!hasEvent(events, EVENT.LABELED)) {
      return {
        stage: FAILED_REGISTER,
        status: "failed",
        performed: [],
        alreadyDone: [],
        assetId,
        error: { name: "StageOrderError", message: "asset has not been labeled" },
      };
    }

    const alreadyDone: string[] = [];
    if (hasEvent(events, EVENT.MEDIA_ENCRYPTED_UPLOADED)) alreadyDone.push("3a");
    if (hasEvent(events, EVENT.TRACE_REGISTERED)) alreadyDone.push("3b");
    if (hasEvent(events, EVENT.IP_REGISTERED)) alreadyDone.push("3c");
    if (hasEvent(events, EVENT.CDR_VAULT_ALLOCATED)) alreadyDone.push("3d");

    if (alreadyDone.length === REGISTER_SUB_STEPS.length) {
      await deps.store.setStage(assetId, "REGISTERED");
      return { stage: "REGISTERED", status: "skipped", performed: [], alreadyDone, assetId };
    }

    const labels = await deps.store.getLabels(assetId);
    const preset =
      ((labels["wtr:license_preset"] as LicensePreset | undefined) ?? deps.defaultLicensePreset);
    const presetRow = await deps.store.getLicensePreset(preset);
    const spgNftContract = await deps.store.getSpgNftContract();

    const performed: string[] = [];
    let subStep: RegisterSubStep = "3a";

    try {
      if (!presetRow) {
        throw new Error(`License preset ${preset} is not registered — run scripts/bootstrap.ts`);
      }
      if (!spgNftContract) {
        throw new Error("No WTR SPG collection recorded — run scripts/bootstrap.ts");
      }

      // ---------------------------------------------------------------- 3a
      subStep = "3a";
      let cid = asset.ipfsCid;
      let mediaVaultUuid = asset.mediaVaultUuid;
      if (!alreadyDone.includes("3a")) {
        const plaintext = await deps.ports.media.readPlaintext({
          assetId,
          filename: asset.filename ?? assetId,
        });
        const upload = await deps.ports.media.uploadEncrypted({
          content: plaintext,
          owner: deps.owner,
        });
        cid = upload.cid;
        mediaVaultUuid = upload.vaultUuid;
        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.MEDIA_ENCRYPTED_UPLOADED,
          idempotencyKey: `3a:${assetId}`,
          // Only references — never key material, never plaintext.
          payload: {
            cid: upload.cid,
            media_vault_uuid: upload.vaultUuid,
            allocate_tx: upload.allocateTxHash,
            write_tx: upload.writeTxHash,
          },
        });
        await deps.store.updateAssetProjection(assetId, {
          ipfsCid: upload.cid,
          mediaVaultUuid: upload.vaultUuid,
        });
        performed.push("3a");
      }

      // ---------------------------------------------------------------- 3b
      subStep = "3b";
      if (!alreadyDone.includes("3b")) {
        const document = await buildTraceDocument(deps.store, assetId, {
          licensePreset: preset,
          providerPayload: { stage: "REGISTERED", ipfs_cid: cid },
        });
        const batchId = await stableBatchId({ action: "trace.register", assetId });
        const registered = await deps.ports.trace.registerData({
          document,
          sourceRecordId: assetId,
          occurredAt: deps.now().toISOString(),
          batchId,
        });
        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.TRACE_REGISTERED,
          idempotencyKey: `3b:${assetId}`,
          payload: {
            data_id: registered.dataId,
            initial_metadata_root: registered.initialMetadataRoot,
            batch_id: batchId,
            ...(deps.ports.trace.mock ? { trace_mock: true } : {}),
          },
        });
        await deps.store.updateAssetProjection(assetId, {
          traceDataId: registered.dataId,
          traceMetadataRoot: registered.initialMetadataRoot,
        });
        performed.push("3b");
      }

      // ---------------------------------------------------------------- 3c
      subStep = "3c";
      let ipId = asset.ipId;
      if (!alreadyDone.includes("3c")) {
        const creator = await deps.store.getCreator(asset.creatorId);
        if (!creator) throw new Error(`Unknown creator ${asset.creatorId}`);

        const encryptedMediaUrl = `ipfs://${cid}`;
        const ipDocument = buildIpMetadataDocument({
          title: asset.filename ?? asset.id,
          description: `WTR asset ${asset.id}`,
          mediaType: asset.mediaType,
          contentSha256: asset.contentSha256,
          encryptedMediaUrl,
          creatorAnonId: creator.anonId,
          licensePreset: preset,
          createdAt: deps.now(),
        });
        const nftDocument = buildNftMetadataDocument({
          title: asset.filename ?? asset.id,
          description: `WTR asset ${asset.id}`,
          imageUrl: encryptedMediaUrl,
          licensePreset: preset,
          contentSha256: asset.contentSha256,
        });

        const ipBody = JSON.stringify(ipDocument);
        const nftBody = JSON.stringify(nftDocument);
        const ipHash = await sha256Bytes(new TextEncoder().encode(ipBody));
        const nftHash = await sha256Bytes(new TextEncoder().encode(nftBody));
        const ipPublished = await deps.ports.story.publishDocument({
          body: ipBody,
          sha256: stripHexPrefix(ipHash),
        });
        const nftPublished = await deps.ports.story.publishDocument({
          body: nftBody,
          sha256: stripHexPrefix(nftHash),
        });

        const registered = await deps.ports.story.registerIpAsset({
          spgNftContract,
          licenseTermsId: presetRow.licenseTermsId,
          licensePreset: preset,
          ipMetadata: {
            ipMetadataURI: ipPublished.uri,
            ipMetadataHash: ipHash,
            nftMetadataURI: nftPublished.uri,
            nftMetadataHash: nftHash,
          },
        });
        ipId = registered.ipId;
        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.IP_REGISTERED,
          idempotencyKey: `3c:${assetId}`,
          payload: {
            ip_id: registered.ipId,
            token_id: registered.tokenId.toString(),
            spg_nft_contract: spgNftContract,
            license_terms_id: presetRow.licenseTermsId.toString(),
            tx_hash: registered.txHash,
            ip_metadata_uri: ipPublished.uri,
          },
        });
        await deps.store.updateAssetProjection(assetId, {
          ipId: registered.ipId,
          nftTokenId: registered.tokenId,
          spgNftContract,
          licenseTermsId: presetRow.licenseTermsId,
        });
        performed.push("3c");
      }

      // ---------------------------------------------------------------- 3d
      subStep = "3d";
      if (!alreadyDone.includes("3d")) {
        if (!ipId) throw new Error("3d requires the ipId produced by 3c");
        if (mediaVaultUuid === null) throw new Error("3d requires the media vault from 3a");

        // Re-seal the {cid, key} payload behind the license read condition.
        const payload = await deps.ports.cdr.readOwnerVault({ vaultUuid: mediaVaultUuid });
        const vault = await deps.ports.cdr.allocateLicenseVault({
          ipId,
          owner: deps.owner,
          payload,
        });
        await deps.store.appendEvent({
          assetId,
          eventType: EVENT.CDR_VAULT_ALLOCATED,
          idempotencyKey: `3d:${assetId}`,
          payload: {
            cdr_vault_uuid: vault.vaultUuid,
            ip_id: ipId,
            allocate_tx: vault.allocateTxHash,
            write_tx: vault.writeTxHash,
          },
        });
        await deps.store.updateAssetProjection(assetId, { cdrVaultUuid: vault.vaultUuid });
        performed.push("3d");
      }

      await deps.store.setStage(assetId, "REGISTERED");
      return { stage: "REGISTERED", status: "completed", performed, alreadyDone, assetId };
    } catch (error) {
      const failure = error as Error;
      // Record exactly how far we got; the retry resumes from here.
      events = await deps.store.listEvents(assetId);
      const completed = [...alreadyDone, ...performed];
      await deps.store.appendEvent({
        assetId,
        eventType: EVENT.REGISTER_FAILED,
        // Attempt-scoped: a later failure at the same sub-step is a new event.
        idempotencyKey: `register-failed:${subStep}:${events.length}`,
        payload: {
          sub_step: subStep,
          completed_sub_steps: completed,
          error_name: failure.name,
          error_message: failure.message,
        },
      });
      await deps.store.setStage(assetId, FAILED_REGISTER);
      log.error("stage 3 register failed", { assetId, subStep, error: failure.message });
      return {
        stage: FAILED_REGISTER,
        status: "failed",
        performed,
        alreadyDone,
        assetId,
        error: { name: failure.name, message: failure.message },
      };
    }
  };
}

/** Sub-steps still outstanding for an asset — used by retry tooling and the e2e script. */
export function outstandingSubSteps(completed: readonly string[]): RegisterSubStep[] {
  return REGISTER_SUB_STEPS.filter((step) => !completed.includes(step));
}

/** `lastEvent` re-export keeps the failure inspector next to the handler it belongs to. */
export function lastFailure(events: Parameters<typeof lastEvent>[0]) {
  return lastEvent(events, EVENT.REGISTER_FAILED);
}
