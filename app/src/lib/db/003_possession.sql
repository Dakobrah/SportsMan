-- Possession and field orientation, v3.
--
-- The tracker previously had no idea who had the ball. The state machine
-- coped by mirroring the coordinate across midfield on every change of
-- possession, so an interception at the opponent's 20 re-read as our own 20
-- and the ball jumped the width of the field on screen. A real turnover
-- moves nobody: the other team takes over on that spot and runs the other
-- way.
--
-- Recording possession makes the -50..+50 frame absolute for the whole game
-- -- -50 is always the end zone we defend -- so a turnover changes only who
-- is driving.
ALTER TABLE games ADD COLUMN current_possession TEXT NOT NULL DEFAULT 'us'
    CHECK (current_possession IN ('us', 'them'));

-- Teams change ends at halftime. That is presentation only: it mirrors how
-- the field is drawn and touches no stored coordinate.
ALTER TABLE games ADD COLUMN sides_swapped INTEGER NOT NULL DEFAULT 0;

-- Which side ran the play, so a cursor can be rebuilt from the plays alone.
ALTER TABLE snaps ADD COLUMN possession TEXT NOT NULL DEFAULT 'us'
    CHECK (possession IN ('us', 'them'));
