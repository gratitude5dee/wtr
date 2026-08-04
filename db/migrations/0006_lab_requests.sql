-- ---------------------------------------------------------------------------
-- Lab request authoring/review (goal.md P0-7). Requests gain an owner (the
-- wallet-authenticated account that posted the brief and reviews its
-- submissions), a KYC requirement, an optional per-unit price and a deadline.
-- requester_anon_id stays the pseudonym shown to creators.
-- ---------------------------------------------------------------------------
ALTER TABLE data_request
  ADD COLUMN requester_creator_id UUID REFERENCES creator(id),
  ADD COLUMN kyc_required         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN unit_price_wei       NUMERIC(78, 0),
  ADD COLUMN deadline             TIMESTAMPTZ;

CREATE INDEX data_request_requester_idx ON data_request (requester_creator_id);

-- Review decisions carry who/when, for the request's audit trail.
ALTER TABLE submission
  ADD COLUMN reviewed_at TIMESTAMPTZ;
