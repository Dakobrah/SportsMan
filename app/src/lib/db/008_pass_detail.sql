-- Pass detail, v8.
--
-- The spec distinguishes the TARGET (the intended receiver, set on every
-- attempt) from the RECEIVER (who actually caught it, set only on a
-- completion). Both columns have existed since v1, but toSnapRow wrote the
-- same player to each, so a drop was indistinguishable from a completion at
-- the row level.
--
-- Splitting them is what makes catch rate real: targets come from target_id,
-- receptions from receiver_id.
--
-- air_yards, yards_after_catch, is_thrown_away and was_under_pressure also
-- already exist and were never written.
ALTER TABLE snaps ADD COLUMN target_number INTEGER;

-- Existing rows wrote the receiver into both, so the target is the receiver.
UPDATE snaps SET target_number = receiver_number WHERE receiver_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snaps_target ON snaps (kind, target_id);
