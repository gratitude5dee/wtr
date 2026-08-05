-- ---------------------------------------------------------------------------
-- Agent traces as a first-class modality.
--
-- `asset.modality` carried a CHECK listing the five media modalities
-- (migration 0002). Agent-trace exports (Hermes, OpenClaw, Codex, Claude
-- Code) are a sixth: they are uploaded, encrypted and labeled through exactly
-- the same pipeline, but their labels are structural (turns, tool calls,
-- outcome) rather than perceptual.
--
-- Forward-only: the constraint is replaced by a widened one. Every existing
-- row already satisfies it, so no data changes.
-- ---------------------------------------------------------------------------
ALTER TABLE asset DROP CONSTRAINT asset_modality_check;

ALTER TABLE asset ADD CONSTRAINT asset_modality_check
  CHECK (modality IN ('audio', 'video', 'image', 'threed', 'motion', 'agenttrace'));
