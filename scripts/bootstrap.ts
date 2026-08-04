/**
 * `npm run bootstrap` — one-time, idempotent setup of WTR's on-chain identity.
 *
 *  1. Create a WTR-OWNED SPG NFT collection via `nftClient.createNFTCollection`.
 *     The public shared Aeneid collection is never used: WTR must control minting
 *     and the collection metadata for assets it registers.
 *  2. Publish the three PIL terms JSON documents at content-addressed URIs.
 *  3. Register one `licenseTermsId` per preset and persist all of it, so every
 *     later registration reuses the same ids instead of re-registering terms.
 *
 * Re-running is safe: existing rows short-circuit each step.
 */
import { createClients } from "../src/lib/chain/clients";
import { closePool, db } from "../src/lib/db/pool";
import { log } from "../src/lib/log";
import { createStoryPort } from "../src/lib/pipeline/adapters";
import {
  LICENSE_PRESETS,
  licenseTerms,
  termsDocument,
  termsDocumentLocation,
  type LicensePreset,
} from "../src/lib/story/license-presets";
import { CHAIN_ID } from "../config/chain";
import { PIL_TERMS_BASE_URI } from "../config/env";

/** Phase 1 asks a nominal fee so the $WIP deposit/approve path is genuinely exercised. */
const DEFAULT_MINTING_FEE_WEI = 1_000_000_000_000_000n; // 0.001 $WIP
const COMMERCIAL_REV_SHARE_PERCENT = 5;

async function existingCollection(): Promise<`0x${string}` | null> {
  const { rows } = await db.query<{ contract_address: string }>(
    "SELECT contract_address FROM spg_collection WHERE chain_id = $1 ORDER BY created_at DESC LIMIT 1",
    [CHAIN_ID],
  );
  return (rows[0]?.contract_address as `0x${string}` | undefined) ?? null;
}

async function main(): Promise<void> {
  const clients = createClients();
  const story = createStoryPort({ clients });

  // ---------------------------------------------------------- SPG collection
  let spgNftContract = await existingCollection();
  if (spgNftContract) {
    log.info("reusing WTR SPG collection", { spgNftContract });
  } else {
    const created = await clients.story.nftClient.createNFTCollection({
      name: "WTR Assets",
      symbol: "WTR",
      // WTR-owned: only addresses with the minter role may mint.
      isPublicMinting: false,
      mintOpen: true,
      mintFeeRecipient: clients.account.address,
      contractURI: "",
      owner: clients.account.address,
    });
    if (!created.spgNftContract) throw new Error("createNFTCollection returned no address");
    spgNftContract = created.spgNftContract;
    await db.query(
      `INSERT INTO spg_collection (chain_id, contract_address, name, symbol, owner_address, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [CHAIN_ID, spgNftContract, "WTR Assets", "WTR", clients.account.address, created.txHash ?? null],
    );
    log.info("created WTR SPG collection", { spgNftContract, txHash: created.txHash });
  }

  // -------------------------------------------------------- license presets
  for (const preset of LICENSE_PRESETS as readonly LicensePreset[]) {
    const { rows } = await db.query<{ license_terms_id: string }>(
      "SELECT license_terms_id FROM license_preset WHERE chain_id = $1 AND preset = $2",
      [CHAIN_ID, preset],
    );
    if (rows[0]) {
      log.info("reusing license terms", { preset, licenseTermsId: rows[0].license_terms_id });
      continue;
    }

    const location = await termsDocumentLocation(preset, PIL_TERMS_BASE_URI());
    // Publish first: the on-chain terms reference this URI, so it must resolve.
    const published = await story.publishDocument({
      body: location.body,
      sha256: location.sha256,
    });

    const registered = await clients.story.license.registerPILTerms(
      licenseTerms({
        preset,
        uri: published.uri,
        defaultMintingFeeWei: DEFAULT_MINTING_FEE_WEI,
        commercialRevSharePercent: COMMERCIAL_REV_SHARE_PERCENT,
      }),
    );
    if (registered.licenseTermsId === undefined) {
      throw new Error(`registerPILTerms returned no licenseTermsId for ${preset}`);
    }

    const document = termsDocument(preset);
    await db.query(
      `INSERT INTO license_preset
         (chain_id, preset, license_terms_id, terms_uri, terms_sha256, ai_learning_models, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        CHAIN_ID,
        preset,
        registered.licenseTermsId.toString(),
        published.uri,
        location.sha256,
        document.aiLearningModels,
        registered.txHash ?? null,
      ],
    );
    log.info("registered license terms", {
      preset,
      licenseTermsId: registered.licenseTermsId.toString(),
      aiLearningModels: document.aiLearningModels,
      uri: published.uri,
    });
  }

  console.log(`spgNftContract=${spgNftContract}`);
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => {});
  process.exit(1);
});
