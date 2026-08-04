-- Tier-2 labeling jobs (goal.md P0-3): labeling is queued, upload never
-- blocks on it. 'awaiting_model' records honestly that no tier-2 model is
-- configured yet (goal.md §13 Q9).
CREATE TABLE label_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES asset(id),
  tier SMALLINT NOT NULL DEFAULT 2,
  state TEXT NOT NULL CHECK (state IN ('awaiting_model', 'queued', 'running', 'done', 'failed')),
  model_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX label_job_asset_idx ON label_job (asset_id);
