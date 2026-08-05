-- ---------------------------------------------------------------------------
-- Generalize the labeling queue. `label_job` was tier-2-vision only; the same
-- queue now carries every kind of labeling work (trace structural extraction,
-- LLM juries, ...). `job_type` names the labeler in the registry
-- (src/lib/labels/registry.ts) and `spec` carries its per-job input.
--
-- `tier`/`state` keep their existing semantics, and the default job_type is
-- the tier-2 vision flow, so every row written by the current code path — and
-- every row already in the table — keeps behaving exactly as before.
-- ---------------------------------------------------------------------------
ALTER TABLE label_job
  ADD COLUMN job_type TEXT NOT NULL DEFAULT 'tier2_vision',
  ADD COLUMN spec     JSONB;

-- Rows recorded against tier 1 are the deterministic intrinsic labeler.
UPDATE label_job SET job_type = 'tier1_intrinsic' WHERE tier = 1;

-- The worker claims by (job_type, state); the asset index alone doesn't serve it.
CREATE INDEX label_job_type_state_idx ON label_job (job_type, state);
