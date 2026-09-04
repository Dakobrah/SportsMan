-- Durable tracker state, v2.
--
-- Django rebuilt the resume state from the last snap's down/distance/
-- ball_position (apps/frontend/tracker.py:377-389), but a snap records the
-- state *before* that play ran. Reloading the tracker therefore rewound one
-- play every time, and a quarter change with no play recorded after it was
-- lost entirely. Storing the cursor explicitly is the fix; lib/game/cursor.ts
-- derives it with `cursorAfter`, which is `computeNextState` applied to the
-- last snap rather than the values read off it.
--
-- The cursor is 1:1 with a game, so it lives on `games` rather than in a
-- tenth table: no join to load it, and the backup document stays at exactly
-- the tables that already exist.
--
-- Defaults are the opening situation: Q1, 1st & 10 on our own 25, which is
-- -25 under the -50..+50 convention owned by lib/game/field.ts.

ALTER TABLE games ADD COLUMN current_quarter INTEGER NOT NULL DEFAULT 1;

-- Null on a dead ball: a kickoff or extra point has no down or distance.
ALTER TABLE games ADD COLUMN current_down     INTEGER DEFAULT 1;
ALTER TABLE games ADD COLUMN current_distance INTEGER DEFAULT 10;

ALTER TABLE games ADD COLUMN current_ball_position INTEGER NOT NULL DEFAULT -25;

-- Mirrors the `Situation` union in lib/game/nextState.ts.
ALTER TABLE games ADD COLUMN current_situation TEXT NOT NULL DEFAULT 'normal'
    CHECK (current_situation IN
        ('normal', 'extra_point', 'kickoff', 'turnover',
         'turnover_on_downs', 'opponent_ball'));
