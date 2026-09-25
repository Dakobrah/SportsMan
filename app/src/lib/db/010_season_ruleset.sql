-- Season ruleset, v10.
--
-- Where kickoffs and tries are spotted, where touchbacks come out and what a
-- missed field goal gives the defense all depend on the level of play. A
-- season is one level, so the choice lives here; see engine/Ruleset.ts.
--
-- Defaults to college because every constant the app used before this was a
-- college one: existing seasons keep replaying exactly as they did.
ALTER TABLE seasons ADD COLUMN ruleset TEXT NOT NULL DEFAULT 'NCAA'
    CHECK (ruleset IN ('NFHS', 'NCAA', 'NFL'));
