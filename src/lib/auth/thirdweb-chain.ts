/** Client-safe chain definition (no server env, no node built-ins). */
import { defineChain } from "thirdweb/chains";

import { CHAIN, RPC_URL } from "../../../config/chain";

export const storyAeneid = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  rpc: RPC_URL,
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  testnet: true,
});
