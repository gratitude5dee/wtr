-- WTR phase 1 schema (goal.md §6).
--
-- Event-sourced: `asset_event` is the append-only source of truth and `asset`
-- is a projection ("spine") maintained from it. Nothing in `asset` may be
-- believed over the event log; rebuilding the projection from `asset_event`
-- must be lossless.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- creator
-- ---------------------------------------------------------------------------
CREATE TABLE creator (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable pseudonym used in every Trace payload. NO PII ever leaves WTR.
  anon_id         TEXT NOT NULL UNIQUE,
  wallet_address  TEXT,
  kyc_status      TEXT NOT NULL DEFAULT 'none'
                    CHECK (kyc_status IN ('none', 'pending', 'verified', 'rejected')),
  kyc_updated_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- consent_acceptance — immutable log. A changed consent is a NEW ROW; rows are
-- never updated or deleted, so the consent state at any past instant is
-- reconstructible.
-- ---------------------------------------------------------------------------
CREATE TABLE consent_acceptance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES creator(id),
  -- Version of the consent document accepted, and the hash of that exact document.
  document_version TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  -- What the creator agreed to, e.g. {"ai_training": true, "exclusive": false}.
  scopes          JSONB NOT NULL,
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the acceptance is superseded by a later row. Never a delete.
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX consent_acceptance_creator_idx ON consent_acceptance (creator_id, accepted_at DESC);

CREATE RULE consent_acceptance_no_delete AS ON DELETE TO consent_acceptance DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- asset — projection of the event log.
-- ---------------------------------------------------------------------------
CREATE TYPE asset_stage AS ENUM (
  'IN_TRAY',
  'LABELED',
  'REGISTERED',
  'LISTED',
  'SOLD',
  'SETTLED',
  'FAILED_REGISTER'
);

CREATE TABLE asset (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            UUID NOT NULL REFERENCES creator(id),
  stage                 asset_stage NOT NULL DEFAULT 'IN_TRAY',
  media_type            TEXT NOT NULL,
  filename              TEXT,
  byte_size             BIGINT,
  -- SHA-256 of the PLAINTEXT bytes. Deduplication key within a creator.
  content_sha256        TEXT NOT NULL,
  -- Raised when the same content_sha256 appears under a different creator.
  -- We never auto-reject: a human resolves the claim.
  duplicate_claim_flag  BOOLEAN NOT NULL DEFAULT FALSE,

  -- stage 3a: encrypted media
  ipfs_cid              TEXT,
  media_vault_uuid      INTEGER,

  -- stage 3b: Trace
  trace_data_id         TEXT,
  trace_metadata_root   TEXT,
  trace_update_count    INTEGER NOT NULL DEFAULT 0,

  -- stage 3c: Story
  ip_id                 TEXT,
  spg_nft_contract      TEXT,
  nft_token_id          NUMERIC(78, 0),
  license_terms_id      NUMERIC(78, 0),

  -- stage 3d: CDR
  cdr_vault_uuid        INTEGER,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Same creator may not claim the same bytes twice.
  CONSTRAINT asset_creator_content_unique UNIQUE (creator_id, content_sha256)
);

CREATE INDEX asset_content_sha256_idx ON asset (content_sha256);
CREATE INDEX asset_stage_idx ON asset (stage);

-- Cross-creator collision on the same bytes: flag both sides for human review
-- instead of rejecting the newcomer, because either party may be the rightful
-- claimant.
CREATE FUNCTION asset_flag_duplicate_claim() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM asset
    WHERE content_sha256 = NEW.content_sha256
      AND creator_id <> NEW.creator_id
  ) THEN
    NEW.duplicate_claim_flag := TRUE;
    UPDATE asset SET duplicate_claim_flag = TRUE
      WHERE content_sha256 = NEW.content_sha256 AND creator_id <> NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER asset_flag_duplicate_claim_trg
  BEFORE INSERT ON asset
  FOR EACH ROW EXECUTE FUNCTION asset_flag_duplicate_claim();

-- ---------------------------------------------------------------------------
-- asset_event — append-only event log.
--
-- `promoted_to_trace` marks the events that were mirrored into a Trace metadata
-- update, and `trace_seq` is the position of that update in the per-`data_id`
-- chain. Only the goal.md-defined subset is ever promoted, because Trace caps
-- updates at 100 per data_id.
-- ---------------------------------------------------------------------------
CREATE TABLE asset_event (
  id                BIGSERIAL PRIMARY KEY,
  asset_id          UUID NOT NULL REFERENCES asset(id),
  seq               INTEGER NOT NULL,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Deterministic key of the semantic action, so a retry appends nothing new.
  idempotency_key   TEXT,
  promoted_to_trace BOOLEAN NOT NULL DEFAULT FALSE,
  trace_seq         INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT asset_event_seq_unique UNIQUE (asset_id, seq),
  CONSTRAINT asset_event_idempotency_unique UNIQUE (asset_id, idempotency_key),
  CONSTRAINT asset_event_trace_seq_unique UNIQUE (asset_id, trace_seq),
  CONSTRAINT asset_event_trace_seq_requires_promotion
    CHECK ((promoted_to_trace AND trace_seq IS NOT NULL) OR (NOT promoted_to_trace AND trace_seq IS NULL))
);

CREATE INDEX asset_event_asset_idx ON asset_event (asset_id, seq);
CREATE INDEX asset_event_type_idx ON asset_event (event_type);

CREATE RULE asset_event_no_delete AS ON DELETE TO asset_event DO INSTEAD NOTHING;
CREATE RULE asset_event_no_update AS ON UPDATE TO asset_event DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- asset_label — stage 2 output.
-- ---------------------------------------------------------------------------
CREATE TABLE asset_label (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     UUID NOT NULL REFERENCES asset(id),
  namespace    TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        JSONB NOT NULL,
  -- 'human' | 'model' | 'import'
  source       TEXT NOT NULL,
  confidence   REAL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT asset_label_unique UNIQUE (asset_id, namespace, key)
);

-- ---------------------------------------------------------------------------
-- listing — stage 4 output.
-- ---------------------------------------------------------------------------
CREATE TABLE listing (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         UUID NOT NULL REFERENCES asset(id),
  license_preset   TEXT NOT NULL,
  license_terms_id NUMERIC(78, 0) NOT NULL,
  -- wei, base-10. Never a float.
  price_wei        NUMERIC(78, 0) NOT NULL,
  currency_address TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'withdrawn', 'sold')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT listing_asset_preset_unique UNIQUE (asset_id, license_preset)
);

-- ---------------------------------------------------------------------------
-- data_request / submission — buyer-side demand and the assets answering it.
-- ---------------------------------------------------------------------------
CREATE TABLE data_request (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_anon_id TEXT NOT NULL,
  title             TEXT NOT NULL,
  spec              JSONB NOT NULL,
  license_preset    TEXT NOT NULL,
  budget_wei        NUMERIC(78, 0) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE submission (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_request_id UUID NOT NULL REFERENCES data_request(id),
  asset_id        UUID NOT NULL REFERENCES asset(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT submission_unique UNIQUE (data_request_id, asset_id)
);

-- ---------------------------------------------------------------------------
-- sale / payout — stage 5.
-- ---------------------------------------------------------------------------
CREATE TABLE sale (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           UUID NOT NULL REFERENCES asset(id),
  listing_id         UUID REFERENCES listing(id),
  data_request_id    UUID REFERENCES data_request(id),
  buyer_anon_id      TEXT NOT NULL,
  license_terms_id   NUMERIC(78, 0) NOT NULL,
  license_token_ids  NUMERIC(78, 0)[] NOT NULL DEFAULT '{}',
  amount_wei         NUMERIC(78, 0) NOT NULL,
  currency_address   TEXT NOT NULL,
  tx_hash            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payout (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id             UUID NOT NULL REFERENCES sale(id),
  creator_id          UUID NOT NULL REFERENCES creator(id),
  amount_wei          NUMERIC(78, 0) NOT NULL,
  currency_address    TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'credited', 'paid', 'failed')),
  -- The only monetary field promoted to Trace (goal.md §5).
  payment_credited_at TIMESTAMPTZ,
  tx_hash             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- scoped_group — a named bundle of assets sharing a license scope.
-- ---------------------------------------------------------------------------
CREATE TABLE scoped_group (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  license_preset TEXT NOT NULL,
  -- Story group IP id, once the group is registered on-chain.
  group_ip_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scoped_group_member (
  scoped_group_id UUID NOT NULL REFERENCES scoped_group(id),
  asset_id        UUID NOT NULL REFERENCES asset(id),
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scoped_group_id, asset_id)
);

-- ---------------------------------------------------------------------------
-- Bootstrap outputs: the WTR SPG collection and the three registered PIL terms.
-- Registered ONCE, then reused by every asset.
-- ---------------------------------------------------------------------------
CREATE TABLE spg_collection (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id         INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  name             TEXT NOT NULL,
  symbol           TEXT NOT NULL,
  -- WTR-owned: never the public shared Aeneid collection.
  owner_address    TEXT NOT NULL,
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT spg_collection_unique UNIQUE (chain_id, contract_address)
);

CREATE TABLE license_preset (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id         INTEGER NOT NULL,
  -- 'WTR-TRAIN-EXCLUSIVE' | 'WTR-TRAIN-NONEXCLUSIVE' | 'WTR-NO-TRAIN'
  preset           TEXT NOT NULL,
  license_terms_id NUMERIC(78, 0) NOT NULL,
  terms_uri        TEXT NOT NULL,
  terms_sha256     TEXT NOT NULL,
  ai_learning_models BOOLEAN NOT NULL,
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT license_preset_unique UNIQUE (chain_id, preset)
);
