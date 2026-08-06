-- Proof of wallet control, recorded explicitly.
--
-- `wallet_address` alone proves nothing: a creator can type any address into
-- settings. Only a completed SIWE sign-in (or the onboarding step that carries
-- a SIWE-verified wallet) stamps this column, and changing the address in
-- settings clears it again. `contributor.account_verification_status` in the
-- attested Trace document is derived from THIS column, never from the address.
ALTER TABLE creator ADD COLUMN wallet_verified_at TIMESTAMPTZ;
