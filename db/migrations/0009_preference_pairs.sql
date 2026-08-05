-- ---------------------------------------------------------------------------
-- DPO / pairwise-preference pairs. The unit of a preference label is a *pair*
-- (one prompt, a chosen and a rejected candidate), not a property of a single
-- asset, so it gets its own table instead of being squeezed into asset_label.
--
-- `jurors` holds the per-juror record the LLM jury produced (vote, confidence,
-- both orderings, rationale, recusals, agreement); `confidence` is the jury's
-- aggregate. Rows only ever carry text that was already in the job spec —
-- never plaintext originals, never keys.
-- ---------------------------------------------------------------------------
CREATE TABLE preference_pair (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt         TEXT NOT NULL,
  chosen         TEXT NOT NULL,
  rejected       TEXT NOT NULL,
  confidence     REAL NOT NULL,
  jurors         JSONB NOT NULL,
  asset_id       UUID NULL REFERENCES asset(id),
  trace_asset_id UUID NULL REFERENCES asset(id),
  job_id         UUID NULL REFERENCES label_job(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX preference_pair_asset_idx ON preference_pair (asset_id);
CREATE INDEX preference_pair_created_at_idx ON preference_pair (created_at);

-- One pair per labeling job: a job that is retried or re-run cannot append a
-- second copy of the same verdict.
CREATE UNIQUE INDEX preference_pair_job_key ON preference_pair (job_id)
  WHERE job_id IS NOT NULL;
