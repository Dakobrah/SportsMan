-- Punt and kickoff returns, v6.
--
-- The GDD models PuntReturnSnap and KickoffReturnSnap as snap types of their
-- own. They are recorded here on the KICK'S row instead, for the same reason
-- defensive detail rides on the opponent's offensive snap: one play
-- happened, so one row records it. nflverse models it the same way -- a punt
-- row carries its return yards.
--
-- It also avoids widening the `kind` CHECK constraint, which SQLite can only
-- do by rebuilding the whole table.
--
-- The payoff is that `fumbled`/`fumble_lost` finally mean something on a
-- kick: the RETURNING team muffed it. The state machine reads that as
-- possession staying with the kicking team, which is the one case where a
-- lost fumble does not change hands the usual way.
ALTER TABLE snaps ADD COLUMN returner_id     INTEGER REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE snaps ADD COLUMN returner_number INTEGER;
ALTER TABLE snaps ADD COLUMN return_yards    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE snaps ADD COLUMN is_fair_catch   INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_snaps_returner ON snaps (kind, returner_id);
