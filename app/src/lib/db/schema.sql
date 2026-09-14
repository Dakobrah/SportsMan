-- Sportsman local schema, v1.
--
-- Django modelled snaps with multi-table inheritance: BaseSnap -> OffenseSnap
-- -> RunPlay, each its own table joined by pointer. That is an ORM
-- convenience with no value here, so it is flattened into one `snaps` table
-- with a `kind` discriminator and nullable kind-specific columns. Every
-- report becomes a single-table query with no joins.
--
-- Columns are shared wherever the meaning is the same across kinds:
-- `yards_gained` serves runs and passes, `kicker_id` serves kickoffs, field
-- goals and PATs, `result` serves field goals and PATs. Only genuinely
-- distinct concepts get their own column.
--
-- Booleans are INTEGER 0/1 and timestamps are ISO-8601 TEXT, per SQLite
-- convention.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER NOT NULL,
    applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    abbreviation TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seasons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    year       INTEGER NOT NULL,
    team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (year, team_id)
);

CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    first_name TEXT    NOT NULL,
    last_name  TEXT    NOT NULL,
    position   TEXT    NOT NULL,
    number     INTEGER NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id       INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    date            TEXT    NOT NULL,
    opponent        TEXT    NOT NULL,
    location        TEXT    NOT NULL,
    weather         TEXT    NOT NULL,
    field_condition TEXT    NOT NULL,
    team_score      INTEGER NOT NULL DEFAULT 0,
    opponent_score  INTEGER NOT NULL DEFAULT 0,
    notes           TEXT    NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quarter_scores (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id        INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    quarter        INTEGER NOT NULL,
    team_score     INTEGER NOT NULL DEFAULT 0,
    opponent_score INTEGER NOT NULL DEFAULT 0,
    UNIQUE (game_id, quarter)
);

-- Formation / play-call reference list.
CREATE TABLE IF NOT EXISTS plays (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    unit_type   TEXT NOT NULL CHECK (unit_type IN ('OFF', 'DEF', 'ST')),
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS snaps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,

    -- What sort of play this row describes. Everything nullable below is
    -- interpreted against this.
    kind            TEXT NOT NULL CHECK (kind IN
                        ('RUN', 'PASS', 'DEFENSE', 'PUNT', 'KICKOFF',
                         'FG', 'XP', 'PENALTY')),

    -- Common to every snap.
    sequence_number INTEGER NOT NULL,
    quarter         INTEGER NOT NULL,
    game_clock_seconds INTEGER,
    down            INTEGER,
    distance        INTEGER,
    ball_position   INTEGER,   -- -50..+50, see lib/game/field.ts
    formation       TEXT NOT NULL DEFAULT '',
    play_id         INTEGER REFERENCES plays(id) ON DELETE SET NULL,
    notes           TEXT NOT NULL DEFAULT '',

    -- Yardage and outcome. Shared by RUN and PASS; `yards_gained` is also
    -- how a sack's loss is recorded alongside sack_yards.
    yards_gained    INTEGER NOT NULL DEFAULT 0,
    is_touchdown    INTEGER NOT NULL DEFAULT 0,
    is_first_down   INTEGER NOT NULL DEFAULT 0,
    fumbled         INTEGER NOT NULL DEFAULT 0,
    fumble_lost     INTEGER NOT NULL DEFAULT 0,
    fumble_recovered_by_id INTEGER REFERENCES players(id) ON DELETE SET NULL,

    -- RUN
    ball_carrier_id INTEGER REFERENCES players(id) ON DELETE SET NULL,

    -- PASS
    quarterback_id     INTEGER REFERENCES players(id) ON DELETE SET NULL,
    target_id          INTEGER REFERENCES players(id) ON DELETE SET NULL,
    receiver_id        INTEGER REFERENCES players(id) ON DELETE SET NULL,
    is_complete        INTEGER NOT NULL DEFAULT 0,
    air_yards          INTEGER NOT NULL DEFAULT 0,
    yards_after_catch  INTEGER NOT NULL DEFAULT 0,
    is_interception    INTEGER NOT NULL DEFAULT 0,
    is_thrown_away     INTEGER NOT NULL DEFAULT 0,
    was_under_pressure INTEGER NOT NULL DEFAULT 0,
    was_sacked         INTEGER NOT NULL DEFAULT 0,
    sack_yards         INTEGER NOT NULL DEFAULT 0,

    -- DEFENSE. `defense_result` is its own column rather than reusing a
    -- shared one: its values (TACKLE/TFL/SACK/...) mean something different
    -- from an offensive play result.
    defense_result          TEXT CHECK (defense_result IN
                                ('TACKLE', 'TFL', 'SACK', 'INT', 'FREC', 'PD', 'PENALTY')),
    secondary_formation     TEXT NOT NULL DEFAULT '',
    primary_player_id       INTEGER REFERENCES players(id) ON DELETE SET NULL,
    tackle_yards            INTEGER,
    tackle_for_loss         INTEGER NOT NULL DEFAULT 0,
    applied_pressure        INTEGER NOT NULL DEFAULT 0,
    forced_incompletion     INTEGER NOT NULL DEFAULT 0,
    interception_return_yards INTEGER,
    fumble_return_yards     INTEGER,
    is_defensive_touchdown  INTEGER NOT NULL DEFAULT 0,

    -- Kicking. `kicker_id` and `result` are shared by KICKOFF, FG and XP.
    kicker_id       INTEGER REFERENCES players(id) ON DELETE SET NULL,
    holder_id       INTEGER REFERENCES players(id) ON DELETE SET NULL,
    result          TEXT CHECK (result IN ('GOOD', 'MISS', 'BLOCK', 'FAIL')),
    is_touchback    INTEGER NOT NULL DEFAULT 0,
    out_of_bounds   INTEGER NOT NULL DEFAULT 0,

    -- PUNT
    punter_id           INTEGER REFERENCES players(id) ON DELETE SET NULL,
    punt_yards          INTEGER NOT NULL DEFAULT 0,
    hang_time_seconds   REAL,
    is_blocked          INTEGER NOT NULL DEFAULT 0,
    downed_at_yard_line INTEGER,

    -- KICKOFF
    kick_yards       INTEGER NOT NULL DEFAULT 0,
    is_onside_kick   INTEGER NOT NULL DEFAULT 0,
    onside_recovered INTEGER NOT NULL DEFAULT 0,

    -- FG
    kick_distance INTEGER,

    -- XP
    attempt_type TEXT CHECK (attempt_type IN ('KICK', '2PT_RUN', '2PT_PASS')),
    passer_id    INTEGER REFERENCES players(id) ON DELETE SET NULL,

    -- PENALTY, and penalties attached to any other snap.
    had_penalty         INTEGER NOT NULL DEFAULT 0,
    penalty_player_id   INTEGER REFERENCES players(id) ON DELETE SET NULL,
    penalty_yards       INTEGER,
    penalty_description TEXT NOT NULL DEFAULT '',
    penalty_on_offense  INTEGER,
    penalty_accepted    INTEGER,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (game_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS defense_assists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    snap_id     INTEGER NOT NULL REFERENCES snaps(id) ON DELETE CASCADE,
    player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    assist_type TEXT NOT NULL CHECK (assist_type IN ('TACKLE', 'SACK', 'COV')),
    UNIQUE (snap_id, player_id, assist_type)
);

-- Indexes follow the access patterns: the tracker reads the latest snap of a
-- game, and every report filters a game (or season) by kind and groups by a
-- player column.
CREATE INDEX IF NOT EXISTS idx_players_team    ON players (team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_seasons_team    ON seasons (team_id);
CREATE INDEX IF NOT EXISTS idx_games_season    ON games (season_id, date);
CREATE INDEX IF NOT EXISTS idx_snaps_sequence  ON snaps (game_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_snaps_kind      ON snaps (game_id, kind);
CREATE INDEX IF NOT EXISTS idx_snaps_quarter   ON snaps (game_id, quarter);
CREATE INDEX IF NOT EXISTS idx_snaps_carrier   ON snaps (kind, ball_carrier_id);
CREATE INDEX IF NOT EXISTS idx_snaps_qb        ON snaps (kind, quarterback_id);
CREATE INDEX IF NOT EXISTS idx_snaps_receiver  ON snaps (kind, receiver_id);
CREATE INDEX IF NOT EXISTS idx_snaps_defender  ON snaps (kind, primary_player_id);
CREATE INDEX IF NOT EXISTS idx_snaps_kicker    ON snaps (kind, kicker_id);
CREATE INDEX IF NOT EXISTS idx_snaps_punter    ON snaps (kind, punter_id);
CREATE INDEX IF NOT EXISTS idx_assists_snap    ON defense_assists (snap_id);
CREATE INDEX IF NOT EXISTS idx_assists_player  ON defense_assists (player_id);
