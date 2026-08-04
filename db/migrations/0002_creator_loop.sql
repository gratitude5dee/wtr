-- Creator-loop fields (goal.md §6, phase 1). Everything here is additive:
-- the phase-0 pipeline keeps working against the unchanged columns.

-- Identity surfaces for the dashboard. `avatar_seed` feeds the generative
-- avatar so there is no image upload and no moderation surface.
ALTER TABLE creator ADD COLUMN display_name TEXT;
ALTER TABLE creator ADD COLUMN avatar_seed  TEXT NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex');
ALTER TABLE creator ADD COLUMN kyc_country  TEXT;
ALTER TABLE creator ADD COLUMN tax_status   TEXT NOT NULL DEFAULT 'not_submitted'
  CHECK (tax_status IN ('not_submitted', 'submitted', 'verified'));
ALTER TABLE creator ADD COLUMN payout_pref  TEXT NOT NULL DEFAULT 'onchain'
  CHECK (payout_pref IN ('onchain', 'fiat'));

-- The consent document the creator accepted must be re-fetchable forever.
ALTER TABLE consent_acceptance ADD COLUMN document_uri TEXT;

-- Modality drives labeling and preview rules; the preview is the only
-- publicly served artifact (goal.md §5.3).
ALTER TABLE asset ADD COLUMN modality TEXT NOT NULL DEFAULT 'audio'
  CHECK (modality IN ('audio', 'video', 'image', 'threed', 'motion'));
ALTER TABLE asset ADD COLUMN preview_url TEXT;

-- Labels carry their own provenance (goal.md P0-3): which model produced a
-- model label, and whether the creator confirmed it.
ALTER TABLE asset_label ADD COLUMN model_id TEXT;
ALTER TABLE asset_label ADD COLUMN confirmed_by_creator BOOLEAN NOT NULL DEFAULT FALSE;

-- Payouts run on two rails (goal.md P0-8): on-chain (tx_hash) or fiat
-- (external_ref from the payment processor).
ALTER TABLE payout ADD COLUMN rail TEXT NOT NULL DEFAULT 'onchain'
  CHECK (rail IN ('onchain', 'fiat'));
ALTER TABLE payout ADD COLUMN external_ref TEXT;
