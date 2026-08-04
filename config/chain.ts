/**
 * Single source of truth for every chain-level constant in WTR.
 *
 * Phase 1 is Story Aeneid testnet only. No other chain is configured, and no
 * `0x…` address literal may appear anywhere else in the codebase — see
 * `tests/no-address-literals.test.ts`, which fails the build if one does.
 *
 * Addresses are transcribed verbatim from goal.md §5.2 and re-verified against
 * Aeneid at the start of this phase (see VERIFICATION.md for the evidence).
 */
import { defineChain } from "viem";

/** Story Aeneid testnet chain id. */
export const CHAIN_ID = 1315 as const;

/** goal.md §5.2 RPC endpoint. Overridable because DNS for this host is not always resolvable — see VERIFICATION.md. */
export const RPC_URL = process.env.WTR_RPC_URL ?? "https://testnet.rpc.story.foundation";

/** goal.md §5.2 explorer. */
export const EXPLORER_URL =
  process.env.WTR_EXPLORER_URL ?? "https://testnet.explorer.story.foundation";

/** Native token of Story. Note the naming hazard in goal.md: the native token is `$IP`, the wrapped ERC-20 is `$WIP`. */
export const NATIVE_CURRENCY = { name: "IP", symbol: "IP", decimals: 18 } as const;

export const CHAIN = defineChain({
  id: CHAIN_ID,
  name: "Story Aeneid Testnet",
  nativeCurrency: NATIVE_CURRENCY,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Story Aeneid Explorer", url: EXPLORER_URL } },
  testnet: true,
});

/**
 * CDR condition contracts (goal.md §5.2), verbatim.
 *
 * `OWNER_WRITE_CONDITION` gates vault writes to the vault owner.
 * `LICENSE_READ_CONDITION` gates vault reads on holding a license token for an IP asset.
 * `LICENSE_TOKEN` is Story's LicenseToken ERC-721 — the token the read condition checks.
 */
export const OWNER_WRITE_CONDITION = "0x4C9bFC96d7092b590D497A191826C3dA2277c34B" as const;
export const LICENSE_READ_CONDITION = "0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3" as const;
export const LICENSE_TOKEN = "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC" as const;

/** Sentinel "unset address" — e.g. "no commercializer checker" in PIL terms. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** CDR network selector for `@piplabs/cdr-sdk` (Aeneid is its `"testnet"`). */
export const CDR_NETWORK = "testnet" as const;

/**
 * WTR's own SPG NFT collection, created once by `scripts/bootstrap.ts`.
 *
 * NEVER the public shared Aeneid collection: WTR must own the collection so it
 * controls minting and metadata. Empty until bootstrap has run.
 */
export const SPG_NFT_CONTRACT = (process.env.WTR_SPG_NFT_CONTRACT ?? "") as `0x${string}` | "";

/**
 * Royalty module — the `spender` that must be approved before
 * `license.mintLicenseTokens()` can pull the minting fee in $WIP.
 *
 * `@story-protocol/core-sdk` does not re-export `royaltyModuleAddress` from its
 * package root, so the address is transcribed here (the only place literals are
 * allowed) and re-verified on-chain by `npm run verify:addresses`.
 */
export const ROYALTY_MODULE = "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086" as const;

/**
 * Wrapped IP. Naming hazard (goal.md): the SDK constant is `WIP_TOKEN_ADDRESS`
 * and the token is `$WIP`; do not "correct" it to `$IP` or `WIP_TOKEN`.
 */
export { WIP_TOKEN_ADDRESS } from "@story-protocol/core-sdk";

export function explorerTxUrl(txHash: `0x${string}`): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: `0x${string}`): string {
  return `${EXPLORER_URL}/address/${address}`;
}

/** Every address this phase depends on, for the start-of-phase re-verification script. */
export const VERIFIABLE_ADDRESSES = {
  OWNER_WRITE_CONDITION,
  LICENSE_READ_CONDITION,
  LICENSE_TOKEN,
  ROYALTY_MODULE,
} as const;
