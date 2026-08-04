import { CHAIN_ID } from "../../../config/chain";

/** Always-on honesty strip: everything here is a real write to a test chain. */
export function TestnetBanner() {
  return (
    <div className="flex items-baseline gap-4 border-b bg-card px-6 py-2 font-mono text-xs">
      <span className="flex items-center gap-2 whitespace-nowrap font-medium uppercase tracking-wider text-[rgb(var(--tint-orange))]">
        <span className="inline-block size-1.5 rounded-full bg-[rgb(var(--tint-orange))]" />
        Aeneid testnet · chain {CHAIN_ID}
      </span>
      <span className="text-muted-foreground">
        Confidential Data Rails is testnet-only. Every hash, vault and license here is a
        real write to a test chain — balances are test funds.
      </span>
    </div>
  );
}
