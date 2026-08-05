-- ---------------------------------------------------------------------------
-- Request funding, shape and instructions. A brief may be posted unfunded, or
-- backed by a 10% deposit, or paid in full up front; amounts are wei, so they
-- stay NUMERIC(78, 0) like every other money column. `data_shape` is the
-- structured schema of the object the lab wants back; `special_instructions`
-- is free prose shown alongside the brief.
-- ---------------------------------------------------------------------------
ALTER TABLE data_request
  ADD COLUMN funding_mode         TEXT NOT NULL DEFAULT 'none'
    CHECK (funding_mode IN ('none', 'deposit', 'full')),
  ADD COLUMN deposit_wei          NUMERIC(78, 0),
  ADD COLUMN amount_paid_wei      NUMERIC(78, 0) NOT NULL DEFAULT 0,
  ADD COLUMN data_shape           JSONB,
  ADD COLUMN special_instructions TEXT;

-- Only verified labs may post briefs once the gate is on. `managed_by` is the
-- roster edge: an agent, manager or label acting on behalf of a creator, so
-- bulk actions can reach that creator's assets without impersonating them.
ALTER TABLE creator
  ADD COLUMN lab_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN managed_by   UUID REFERENCES creator(id);

CREATE INDEX creator_managed_by_idx ON creator (managed_by);
