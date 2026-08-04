/**
 * `npm run verify:addresses` — run this at the START of every phase.
 *
 * A testnet redeploy of any of the three CDR condition contracts would silently
 * break stage 3d (goal.md §12), so we assert the chain id and that each address
 * still has deployed bytecode before doing any work.
 */
import { createPublicClient, http } from "viem";

import {
  CHAIN,
  CHAIN_ID,
  LICENSE_READ_CONDITION,
  LICENSE_TOKEN,
  OWNER_WRITE_CONDITION,
  RPC_URL,
  ROYALTY_MODULE,
  WIP_TOKEN_ADDRESS,
} from "../config/chain";

const TARGETS = {
  OWNER_WRITE_CONDITION,
  LICENSE_READ_CONDITION,
  LICENSE_TOKEN,
  ROYALTY_MODULE,
  WIP_TOKEN_ADDRESS,
} as const;

async function main(): Promise<void> {
  const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`RPC ${RPC_URL} reports chain ${chainId}, expected Aeneid ${CHAIN_ID}`);
  }
  console.log(`chain id ${chainId} (Aeneid) via ${RPC_URL}`);

  const missing: string[] = [];
  for (const [name, address] of Object.entries(TARGETS)) {
    const code = await client.getCode({ address });
    const size = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    console.log(`${size > 0 ? "ok  " : "MISS"} ${name} ${address} (${size} bytes)`);
    if (size === 0) missing.push(`${name} ${address}`);
  }

  if (missing.length > 0) {
    throw new Error(`No bytecode at: ${missing.join(", ")} — stage 3d would fail`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
