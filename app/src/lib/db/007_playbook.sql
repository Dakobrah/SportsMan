-- The playbook, v7.
--
-- The `plays` table has existed since v1 and has never held a row: it was
-- carried over from Django as a reference list of play names, but nothing
-- populated it and no form offered a picker.
--
-- A play is a formation plus a name -- "Power Right" out of "I Formation" is
-- a different call from "Power Right" out of "Shotgun" -- so formation
-- belongs on the play rather than being free text a coach retypes.
--
-- Snaps keep BOTH `play_id` and `formation`, for the same reason a snap
-- keeps a jersey number alongside the player link: editing or reimporting a
-- playbook must not silently rewrite what a game was recorded as.
ALTER TABLE plays ADD COLUMN formation TEXT NOT NULL DEFAULT '';

-- A playbook has no room for two identical calls, and an import that runs
-- twice should not double it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plays_unique
    ON plays (unit_type, formation, name);

CREATE INDEX IF NOT EXISTS idx_snaps_formation ON snaps (game_id, formation);
