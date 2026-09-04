-- Jersey numbers alongside player links, v4.
--
-- A coach identifies a player by the number on the shirt, and half the
-- players in a game are never going to be in this database: the app keeps
-- one team's roster, but now that possession is tracked, the opponent's
-- offence gets recorded too.
--
-- So the number is what a play always stores, and the player link is set
-- only when the number resolves against our own roster. Reports keep working
-- because they group by player id, and opponent plays -- which have none --
-- are excluded by construction rather than by remembering to filter.
--
-- The pairing also survives a roster edit: a play recorded for #22 keeps the
-- number it was entered with even if that player is later renumbered.
ALTER TABLE snaps ADD COLUMN ball_carrier_number INTEGER;
ALTER TABLE snaps ADD COLUMN quarterback_number INTEGER;
ALTER TABLE snaps ADD COLUMN receiver_number    INTEGER;
ALTER TABLE snaps ADD COLUMN kicker_number      INTEGER;
ALTER TABLE snaps ADD COLUMN punter_number      INTEGER;

-- Existing rows were all our own players, so backfill from the roster.
UPDATE snaps SET ball_carrier_number =
    (SELECT number FROM players WHERE players.id = snaps.ball_carrier_id)
  WHERE ball_carrier_id IS NOT NULL;
UPDATE snaps SET quarterback_number =
    (SELECT number FROM players WHERE players.id = snaps.quarterback_id)
  WHERE quarterback_id IS NOT NULL;
UPDATE snaps SET receiver_number =
    (SELECT number FROM players WHERE players.id = snaps.receiver_id)
  WHERE receiver_id IS NOT NULL;
UPDATE snaps SET kicker_number =
    (SELECT number FROM players WHERE players.id = snaps.kicker_id)
  WHERE kicker_id IS NOT NULL;
UPDATE snaps SET punter_number =
    (SELECT number FROM players WHERE players.id = snaps.punter_id)
  WHERE punter_id IS NOT NULL;
