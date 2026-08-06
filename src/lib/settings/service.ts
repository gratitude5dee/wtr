/**
 * Creator settings mutations (goal.md P0-1/P0-9): display name, wallet,
 * payout preference and tax-form status. KYC status is NOT mutable here —
 * only a verification provider callback may change it.
 */
import { db } from "../db/pool";

/** Bad input, safe to echo to the caller. */
export class SettingsError extends Error {}

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PAYOUT_PREFS = ["onchain", "fiat"] as const;
const MAX_DISPLAY_NAME = 120;

export async function updateCreatorSettings(
  creatorId: string,
  input: {
    displayName: string;
    walletAddress: string;
    payoutPref: string;
    taxSubmitted: boolean;
  },
): Promise<void> {
  const displayName = input.displayName.trim();
  const walletAddress = input.walletAddress.trim();
  const payoutPref = input.payoutPref;

  if (!displayName) throw new SettingsError("display name is required");
  if (displayName.length > MAX_DISPLAY_NAME) {
    throw new SettingsError(`display name must be at most ${MAX_DISPLAY_NAME} characters`);
  }
  if (walletAddress && !WALLET_ADDRESS.test(walletAddress)) {
    throw new SettingsError("wallet address must be 0x followed by 40 hex characters");
  }
  if (!(PAYOUT_PREFS as readonly string[]).includes(payoutPref)) {
    throw new SettingsError("unknown payout preference");
  }
  if (payoutPref === "onchain" && !walletAddress) {
    throw new SettingsError("on-chain payouts need a wallet address");
  }

  const updated = await db.query(
    `UPDATE creator
     SET display_name = $2,
         wallet_address = $3,
         -- A typed address is self-declared: any previous proof of control
         -- stops applying the moment the address changes.
         wallet_verified_at = CASE
           WHEN lower(coalesce(wallet_address, '')) = lower(coalesce($3, ''))
             THEN wallet_verified_at
           ELSE NULL
         END,
         payout_pref = $4,
         tax_status = CASE
           WHEN tax_status = 'not_submitted' AND $5 THEN 'submitted'
           ELSE tax_status
         END
     WHERE id = $1`,
    [creatorId, displayName, walletAddress || null, payoutPref, input.taxSubmitted],
  );
  if (updated.rowCount === 0) throw new SettingsError("creator not found");
}
