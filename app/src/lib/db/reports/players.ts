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
import type { ReportFilters } from './filters';
import { joinedRows } from './query';

interface PlayerLine {
  playerId: number;
  number: number;
  firstName: string;
  lastName: string;
  position: string;
}

const NAME_COLUMNS = `p.id AS player_id, p.number, p.first_name, p.last_name, p.position`;

/**
 * Every query here is the same shape: join `players` on one role column,
 * group by the player. The join IS the possession filter, so none of them
 * pass one.
 */
const byRole = <T>(
  db: Database,
  filters: ReportFilters,
  role: string,
  columns: string,
  extra: string[],
  order: string,
) =>
  joinedRows<T>(
    db, filters,
    `${NAME_COLUMNS},\n${columns}`,
    `snaps s JOIN players p ON p.id = s.${role}`,
    [...extra, `s.${role} IS NOT NULL`],
    `GROUP BY p.id ORDER BY ${order}`,
  );

export interface RushingLine extends PlayerLine {
  attempts: number;
  yards: number;
  touchdowns: number;
  firstDowns: number;
  longest: number | null;
  fumbles: number;
}

export const rushingByPlayer = (db: Database, filters: ReportFilters) =>
  byRole<RushingLine>(db, filters, 'ball_carrier_id', `
  COUNT(*)                                    AS attempts,
  COALESCE(SUM(s.yards_gained), 0)            AS yards,
  COUNT(*) FILTER (WHERE s.is_touchdown = 1)  AS touchdowns,
  COUNT(*) FILTER (WHERE s.is_first_down = 1) AS first_downs,
  MAX(s.yards_gained)                         AS longest,
  COUNT(*) FILTER (WHERE s.fumbled = 1)       AS fumbles`, ["s.kind = 'RUN'"], 'yards DESC, attempts DESC');

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

export const passingByPlayer = (db: Database, filters: ReportFilters) =>
  byRole<PassingLine>(db, filters, 'quarterback_id', `
  COUNT(*) FILTER (WHERE s.was_sacked = 0)      AS attempts,
  COUNT(*) FILTER (WHERE s.is_complete = 1)     AS completions,
  COALESCE(SUM(s.yards_gained) FILTER (WHERE s.is_complete = 1), 0)
                                                AS yards,
  COUNT(*) FILTER (WHERE s.is_touchdown = 1)    AS touchdowns,
  COUNT(*) FILTER (WHERE s.is_interception = 1) AS interceptions,
  COUNT(*) FILTER (WHERE s.was_sacked = 1)      AS sacks,
  COALESCE(SUM(s.sack_yards) FILTER (WHERE s.was_sacked = 1), 0)
                                                AS sack_yards,
  MAX(s.yards_gained) FILTER (WHERE s.is_complete = 1) AS longest`, ["s.kind = 'PASS'"], 'yards DESC');

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
export const receivingByPlayer = (db: Database, filters: ReportFilters) =>
  // Grouped on the TARGET, so a receiver appears for every ball thrown their
  // way and not only the ones they caught -- which is what makes catch rate
  // meaningful.
  byRole<ReceivingLine>(db, filters, 'target_id', `
  COUNT(*) FILTER (WHERE s.was_sacked = 0)    AS targets,
  COUNT(*) FILTER (WHERE s.is_complete = 1)   AS receptions,
  COALESCE(SUM(s.yards_gained) FILTER (WHERE s.is_complete = 1), 0)
                                              AS yards,
  COUNT(*) FILTER (WHERE s.is_touchdown = 1)  AS touchdowns,
  COUNT(*) FILTER (WHERE s.is_first_down = 1) AS first_downs,
  MAX(s.yards_gained) FILTER (WHERE s.is_complete = 1) AS longest`, ["s.kind = 'PASS'"], 'yards DESC, receptions DESC');

export interface KickingLine extends PlayerLine {
  attempts: number;
  made: number;
  longest: number | null;
}

export const kickingByPlayer = (db: Database, filters: ReportFilters) =>
  byRole<KickingLine>(db, filters, 'kicker_id', `
  COUNT(*)                                              AS attempts,
  COUNT(*) FILTER (WHERE s.result = 'GOOD')             AS made,
  MAX(s.kick_distance) FILTER (WHERE s.result = 'GOOD') AS longest`, ["s.kind = 'FG'"], 'made DESC, attempts DESC');

export interface PuntingLine extends PlayerLine {
  punts: number;
  yards: number;
  longest: number | null;
  touchbacks: number;
}

export const puntingByPlayer = (db: Database, filters: ReportFilters) =>
  byRole<PuntingLine>(db, filters, 'punter_id', `
  COUNT(*)                                   AS punts,
  COALESCE(SUM(s.punt_yards), 0)             AS yards,
  MAX(s.punt_yards)                          AS longest,
  COUNT(*) FILTER (WHERE s.is_touchback = 1) AS touchbacks`, ["s.kind = 'PUNT'"], 'punts DESC');
