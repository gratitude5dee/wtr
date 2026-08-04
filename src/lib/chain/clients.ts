/**
 * Chain clients. Every address comes from `config/chain.ts`; nothing here
 * hardcodes one, and no fee is hardcoded — `getAllocateFee` / `getWriteFee` /
 * `getReadFee` are live reads performed by the CDR SDK on every call
 * (goal.md §12).
 */
import { CDRClient, GatewayProvider, type StorageProvider } from "@piplabs/cdr-sdk";
import { StoryClient } from "@story-protocol/core-sdk";
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CDR_NETWORK, CHAIN, RPC_URL } from "../../../config/chain";
import { CDR_API_URL, IPFS_API_URL, IPFS_GATEWAY_URL, WALLET_PRIVATE_KEY } from "../../../config/env";

export interface WtrClients {
  account: ReturnType<typeof privateKeyToAccount>;
  publicClient: PublicClient;
  walletClient: WalletClient;
  story: StoryClient;
  cdr: CDRClient;
  storage: StorageProvider;
}

/** Builds every client from the operator private key. The key never leaves this function. */
export function createClients(): WtrClients {
  const account = privateKeyToAccount(WALLET_PRIVATE_KEY());

  const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) }) as PublicClient;
  const walletClient = createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) });

  const story = StoryClient.newClient({
    account,
    chainId: CHAIN.id,
    transport: http(RPC_URL),
  });

  const cdr = new CDRClient({
    network: CDR_NETWORK,
    publicClient,
    walletClient,
    apiUrl: CDR_API_URL(),
  });

  const storage = new GatewayProvider({
    apiUrl: IPFS_API_URL(),
    gatewayUrl: IPFS_GATEWAY_URL(),
  });

  return { account, publicClient, walletClient, story, cdr, storage };
}
