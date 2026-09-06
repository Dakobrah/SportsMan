-- Defensive attribution, v5.
--
-- Every defense_* column already exists: schema.sql carried them over when
-- Django's polymorphic snap hierarchy was flattened. Nothing ever wrote
-- them, because there was no defensive play form.
--
-- What is added here is the jersey-number pairing the other player columns
-- got in migration 4, so a defender is identified the same way as everyone
-- else and a play keeps the number it was entered with.
--
-- On the model: defensive detail attaches to the OPPONENT'S offensive snap
-- rather than becoming a snap of its own. One play happened, so one row
-- records it. A separate DEFENSE row per play would double every play count,
-- break sequence numbering, and confuse drive segmentation -- all of which
-- read `snaps` as one-row-per-play. The statistics are identical either way:
-- a tackle is our defender on their run, a sack is our defender on their
-- pass with was_sacked set.
ALTER TABLE snaps ADD COLUMN primary_player_number INTEGER;

-- Backfill for symmetry with migration 4. No rows have a defender yet, so
-- this is a no-op today and correct if that ever changes.
UPDATE snaps SET primary_player_number =
    (SELECT number FROM players WHERE players.id = snaps.primary_player_id)
  WHERE primary_player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snaps_defender_num ON snaps (kind, primary_player_number);
