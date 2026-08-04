-- P0-1: onboarding and versioned consent.

-- goal.md P0-1 acceptance fixes the KYC vocabulary to exactly
-- verified | pending | failed | unverified.
ALTER TABLE creator DROP CONSTRAINT creator_kyc_status_check;
UPDATE creator SET kyc_status = 'unverified' WHERE kyc_status = 'none';
UPDATE creator SET kyc_status = 'failed'     WHERE kyc_status = 'rejected';
ALTER TABLE creator ALTER COLUMN kyc_status SET DEFAULT 'unverified';
ALTER TABLE creator ADD CONSTRAINT creator_kyc_status_check
  CHECK (kyc_status IN ('verified', 'pending', 'failed', 'unverified'));

-- A consent acceptance covers BOTH policies (goal.md §6): the existing
-- document_* columns are the ToS; these are the privacy policy.
ALTER TABLE consent_acceptance ADD COLUMN privacy_version TEXT;
ALTER TABLE consent_acceptance ADD COLUMN privacy_sha256  TEXT;
ALTER TABLE consent_acceptance ADD COLUMN privacy_uri     TEXT;
