-- Resumable client-encrypted uploads (goal.md P0-2 / stage 3a in the browser).
-- The server stores ciphertext only; the AES key never leaves the creator's
-- device. IV base and chunk size are not secret and live next to the offset
-- so an interrupted upload can resume exactly where it stopped.

ALTER TABLE asset ADD COLUMN ciphertext_total_bytes  BIGINT;
ALTER TABLE asset ADD COLUMN ciphertext_received     BIGINT NOT NULL DEFAULT 0;
ALTER TABLE asset ADD COLUMN ciphertext_chunk_bytes  INTEGER;
ALTER TABLE asset ADD COLUMN ciphertext_iv_base      TEXT;
ALTER TABLE asset ADD COLUMN ciphertext_complete     BOOLEAN NOT NULL DEFAULT FALSE;
