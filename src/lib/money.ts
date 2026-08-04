/**
 * Monetary amounts are `bigint` wei everywhere (goal.md §12). Formatting to a
 * decimal string happens only here, at the render boundary — never in domain
 * logic, never before persistence.
 */
import { formatUnits, parseUnits } from "viem";

import { NATIVE_CURRENCY } from "../../config/chain";

/** Render wei as a decimal string. Only for display / log output. */
export function formatWei(amount: bigint, decimals: number = NATIVE_CURRENCY.decimals): string {
  return formatUnits(amount, decimals);
}

/** Parse a human decimal string into wei. Only for parsing user input. */
export function toWei(amount: string, decimals: number = NATIVE_CURRENCY.decimals): bigint {
  return parseUnits(amount, decimals);
}

/** Postgres `numeric`/`text` round-trip: amounts are stored as base-10 wei strings. */
export function weiToDb(amount: bigint): string {
  return amount.toString();
}

export function weiFromDb(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}
