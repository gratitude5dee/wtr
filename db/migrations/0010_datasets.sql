-- ---------------------------------------------------------------------------
-- Finetuning playground / dataset builder. A `dataset` is a saved catalog
-- query owned by one account; a `dataset_snapshot` freezes the membership that
-- query resolved to at a moment in time, so an export is reproducible and can
-- be cited in the provenance card long after the catalog has moved on.
--
-- Snapshots are immutable: DO INSTEAD NOTHING rules make UPDATE/DELETE no-ops,
-- the same append-only device `asset_event` uses. Nothing here stores media,
-- keys or PII — only asset ids and the filter the user typed.
--
-- 0009 is reserved for the preference_pair table; the DPO export reads it.
-- ---------------------------------------------------------------------------
CREATE TABLE dataset (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_creator_id UUID NOT NULL REFERENCES creator(id),
  name             TEXT NOT NULL,
  -- The CatalogFilters object, verbatim. `trainingOnly` is re-forced at query
  -- time, so a stored filter can never widen into WTR-NO-TRAIN work.
  filters          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dataset_owner_idx ON dataset (owner_creator_id, created_at DESC);
CREATE UNIQUE INDEX dataset_owner_name_key ON dataset (owner_creator_id, lower(name));

CREATE TABLE dataset_snapshot (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES dataset(id),
  -- Copied, not referenced: editing the dataset must not rewrite history.
  filters    JSONB NOT NULL,
  asset_ids  UUID[] NOT NULL,
  item_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dataset_snapshot_dataset_idx ON dataset_snapshot (dataset_id, created_at DESC);

CREATE RULE dataset_snapshot_no_update AS ON UPDATE TO dataset_snapshot DO INSTEAD NOTHING;
CREATE RULE dataset_snapshot_no_delete AS ON DELETE TO dataset_snapshot DO INSTEAD NOTHING;
