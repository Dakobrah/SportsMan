-- Football rules, v9.
--
-- A safety is a RESULT of a play, not a kind of play -- a run tackled in the
-- end zone, a sack there, a snap out of the back of it -- so it is a flag on
-- the play's row, exactly as is_touchdown is. Modelling it as a new `kind`
-- would also have meant rebuilding this table, since SQLite cannot alter the
-- kind CHECK in place.
ALTER TABLE snaps ADD COLUMN is_safety INTEGER NOT NULL DEFAULT 0;

-- The penalty form has always had an "Auto 1st" toggle, and the catalogue
-- sets it for defensive holding, pass interference, roughing and the rest.
-- Nothing stored it, so the next state -- which is computed from the stored
-- row -- never saw it: third and fifteen plus defensive holding came back as
-- third and ten.
--
-- Defaults to 0 rather than NULL. Earlier rows never recorded it, and their
-- cursors were computed without it; reading them back the same way keeps
-- every existing game where it was.
ALTER TABLE snaps ADD COLUMN penalty_auto_first_down INTEGER NOT NULL DEFAULT 0;

-- onside_recovered has existed since v1 and was never written. It needs no
-- migration, only a form that sets it; see KickoffPlay.
