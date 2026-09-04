/**
 * Per-player aggregates.
 *
 * Every query joins `players` on a role column. **The join is itself the
 * possession filter**: a player link is only ever written when we have the
 * ball, so opponent plays -- which carry a jersey number and a null id --
 * are excluded by construction rather than by remembering to filter. That is
 * the invariant 004_jersey_numbers.sql states, and a test pins it.
 */
import type { Database } from '../driver';
import { toDomainAll } from '../repositories/types';
import { type ReportFilters, snapWhere } from './filters';

interface PlayerLine {
  playerId: number;
  number: number;
  firstName: string;
  lastName: string;
  position: string;
}

const NAME_COLUMNS = `p.id AS player_id, p.number, p.first_name, p.last_name, p.position`;

export interface RushingLine extends PlayerLine {
  attempts: number;
  yards: number;
  touchdowns: number;
  firstDowns: number;
  longest: number | null;
  fumbles: number;
}

export async function rushingByPlayer(
  db: Database,
  filters: ReportFilters,
): Promise<RushingLine[]> {
  const where = snapWhere(filters, ["s.kind = 'RUN'", 's.ball_carrier_id IS NOT NULL'], 's.');
  return toDomainAll<RushingLine>(
    await db.all(
      `SELECT ${NAME_COLUMNS},
              COUNT(*)                                        AS attempts,
              COALESCE(SUM(s.yards_gained), 0)                AS yards,
              COUNT(*) FILTER (WHERE s.is_touchdown = 1)      AS touchdowns,
              COUNT(*) FILTER (WHERE s.is_first_down = 1)     AS first_downs,
              MAX(s.yards_gained)                             AS longest,
              COUNT(*) FILTER (WHERE s.fumbled = 1)           AS fumbles
       FROM snaps s JOIN players p ON p.id = s.ball_carrier_id
       WHERE ${where.sql}
       GROUP BY p.id
       ORDER BY yards DESC, attempts DESC`,
      where.params,
    ),
  );
}

export interface PassingLine extends PlayerLine {
  attempts: number;
  completions: number;
  yards: number;
  touchdowns: number;
  interceptions: number;
  sacks: number;
  sackYards: number;
  longest: number | null;
}

export async function passingByPlayer(
  db: Database,
  filters: ReportFilters,
): Promise<PassingLine[]> {
  const where = snapWhere(filters, ["s.kind = 'PASS'", 's.quarterback_id IS NOT NULL'], 's.');
  return toDomainAll<PassingLine>(
    await db.all(
      `SELECT ${NAME_COLUMNS},
              COUNT(*) FILTER (WHERE s.was_sacked = 0)                    AS attempts,
              COUNT(*) FILTER (WHERE s.is_complete = 1)                   AS completions,
              COALESCE(SUM(s.yards_gained) FILTER (WHERE s.is_complete = 1), 0)
                                                                          AS yards,
              COUNT(*) FILTER (WHERE s.is_touchdown = 1)                  AS touchdowns,
              COUNT(*) FILTER (WHERE s.is_interception = 1)               AS interceptions,
              COUNT(*) FILTER (WHERE s.was_sacked = 1)                    AS sacks,
              COALESCE(SUM(s.sack_yards) FILTER (WHERE s.was_sacked = 1), 0)
                                                                          AS sack_yards,
              MAX(s.yards_gained) FILTER (WHERE s.is_complete = 1)        AS longest
       FROM snaps s JOIN players p ON p.id = s.quarterback_id
       WHERE ${where.sql}
       GROUP BY p.id
       ORDER BY yards DESC`,
      where.params,
    ),
  );
}

export interface ReceivingLine extends PlayerLine {
  /** Every pass thrown their way, completions and incompletions alike. */
  targets: number;
  receptions: number;
  yards: number;
  touchdowns: number;
  firstDowns: number;
  longest: number | null;
}

/**
 * `toSnapRow` writes `receiverId` on incompletions too, so targets and catch
 * rate are computable here -- something the Django reports never exposed.
 */
export async function receivingByPlayer(
  db: Database,
  filters: ReportFilters,
): Promise<ReceivingLine[]> {
  const where = snapWhere(filters, ["s.kind = 'PASS'", 's.receiver_id IS NOT NULL'], 's.');
  return toDomainAll<ReceivingLine>(
    await db.all(
      `SELECT ${NAME_COLUMNS},
              COUNT(*) FILTER (WHERE s.was_sacked = 0)                    AS targets,
              COUNT(*) FILTER (WHERE s.is_complete = 1)                   AS receptions,
              COALESCE(SUM(s.yards_gained) FILTER (WHERE s.is_complete = 1), 0)
                                                                          AS yards,
              COUNT(*) FILTER (WHERE s.is_touchdown = 1)                  AS touchdowns,
              COUNT(*) FILTER (WHERE s.is_first_down = 1)                 AS first_downs,
              MAX(s.yards_gained) FILTER (WHERE s.is_complete = 1)        AS longest
       FROM snaps s JOIN players p ON p.id = s.receiver_id
       WHERE ${where.sql}
       GROUP BY p.id
       ORDER BY yards DESC, receptions DESC`,
      where.params,
    ),
  );
}

export interface KickingLine extends PlayerLine {
  attempts: number;
  made: number;
  longest: number | null;
}

export async function kickingByPlayer(
  db: Database,
  filters: ReportFilters,
): Promise<KickingLine[]> {
  const where = snapWhere(filters, ["s.kind = 'FG'", 's.kicker_id IS NOT NULL'], 's.');
  return toDomainAll<KickingLine>(
    await db.all(
      `SELECT ${NAME_COLUMNS},
              COUNT(*)                                                 AS attempts,
              COUNT(*) FILTER (WHERE s.result = 'GOOD')                AS made,
              MAX(s.kick_distance) FILTER (WHERE s.result = 'GOOD')    AS longest
       FROM snaps s JOIN players p ON p.id = s.kicker_id
       WHERE ${where.sql}
       GROUP BY p.id
       ORDER BY made DESC, attempts DESC`,
      where.params,
    ),
  );
}

export interface PuntingLine extends PlayerLine {
  punts: number;
  yards: number;
  longest: number | null;
  touchbacks: number;
}

export async function puntingByPlayer(
  db: Database,
  filters: ReportFilters,
): Promise<PuntingLine[]> {
  const where = snapWhere(filters, ["s.kind = 'PUNT'", 's.punter_id IS NOT NULL'], 's.');
  return toDomainAll<PuntingLine>(
    await db.all(
      `SELECT ${NAME_COLUMNS},
              COUNT(*)                                     AS punts,
              COALESCE(SUM(s.punt_yards), 0)               AS yards,
              MAX(s.punt_yards)                            AS longest,
              COUNT(*) FILTER (WHERE s.is_touchback = 1)   AS touchbacks
       FROM snaps s JOIN players p ON p.id = s.punter_id
       WHERE ${where.sql}
       GROUP BY p.id
       ORDER BY punts DESC`,
      where.params,
    ),
  );
}
