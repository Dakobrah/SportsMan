/**
 * Defensive aggregates.
 *
 * Defensive detail lives on the opponent's offensive snaps -- one play, one
 * row -- so every query here scopes to `possession = 'them'` and reads the
 * defender columns off those rows. A tackle is our defender on their run; a
 * sack is our defender on their pass with `was_sacked` set.
 *
 * Note the two levels available. Team totals like yards allowed come from
 * `teamTotals(db, { possession: 'them' })` and need no defender recorded at
 * all. What is here is ATTRIBUTION: which of our players made the play,
 * which only exists once a tackler has been entered.
 */
import type { Database } from '../driver';
import type { ReportFilters } from './filters';
import { aggregateRow, joinedRows } from './query';

/** Everything below is about what OUR defense did, so possession is theirs. */
const defensive = (filters: ReportFilters): ReportFilters => ({
  ...filters,
  possession: 'them',
});

export interface DefenseTotals {
  /** Their scrimmage plays where one of ours was credited. */
  tackles: number;
  tacklesForLoss: number;
  sacks: number;
  interceptions: number;
  fumbleRecoveries: number;
  passesDefended: number;
  pressures: number;
  defensiveTouchdowns: number;
  /** Their plays with no defender recorded -- the attribution gap. */
  unattributed: number;
}

const DEFENSE = `
  COUNT(*) FILTER (WHERE primary_player_id IS NOT NULL) AS tackles,
  COUNT(*) FILTER (WHERE tackle_for_loss = 1)           AS tackles_for_loss,
  COUNT(*) FILTER (WHERE was_sacked = 1)                AS sacks,
  COUNT(*) FILTER (WHERE is_interception = 1)           AS interceptions,
  COUNT(*) FILTER (WHERE fumble_lost = 1)               AS fumble_recoveries,
  COUNT(*) FILTER (WHERE forced_incompletion = 1)       AS passes_defended,
  COUNT(*) FILTER (WHERE applied_pressure = 1)          AS pressures,
  COUNT(*) FILTER (WHERE is_defensive_touchdown = 1)    AS defensive_touchdowns,
  COUNT(*) FILTER (WHERE primary_player_id IS NULL)     AS unattributed`;

export const defenseTotals = (db: Database, filters: ReportFilters) =>
  aggregateRow<DefenseTotals>(db, defensive(filters), DEFENSE, ["kind IN ('RUN', 'PASS')"]);

export interface DefenderLine {
  playerId: number;
  number: number;
  firstName: string;
  lastName: string;
  position: string;
  tackles: number;
  tacklesForLoss: number;
  sacks: number;
  interceptions: number;
  fumbleRecoveries: number;
  passesDefended: number;
  pressures: number;
  defensiveTouchdowns: number;
}

const BY_DEFENDER = `
  p.id AS player_id, p.number, p.first_name, p.last_name, p.position,
  COUNT(*)                                             AS tackles,
  COUNT(*) FILTER (WHERE s.tackle_for_loss = 1)        AS tackles_for_loss,
  COUNT(*) FILTER (WHERE s.was_sacked = 1)             AS sacks,
  COUNT(*) FILTER (WHERE s.is_interception = 1)        AS interceptions,
  COUNT(*) FILTER (WHERE s.fumble_lost = 1)            AS fumble_recoveries,
  COUNT(*) FILTER (WHERE s.forced_incompletion = 1)    AS passes_defended,
  COUNT(*) FILTER (WHERE s.applied_pressure = 1)       AS pressures,
  COUNT(*) FILTER (WHERE s.is_defensive_touchdown = 1) AS defensive_touchdowns`;

/** Per-defender, from the plays they were credited on. */
export const defenseByPlayer = (db: Database, filters: ReportFilters) =>
  joinedRows<DefenderLine>(
    db, defensive(filters), BY_DEFENDER,
    'snaps s JOIN players p ON p.id = s.primary_player_id',
    ["s.kind IN ('RUN', 'PASS')", 's.primary_player_id IS NOT NULL'],
    'GROUP BY p.id ORDER BY tackles DESC, sacks DESC',
  );

export interface AssistLine {
  playerId: number;
  number: number;
  firstName: string;
  lastName: string;
  tackleAssists: number;
  sackAssists: number;
  coverageAssists: number;
}

const BY_ASSIST = `
  p.id AS player_id, p.number, p.first_name, p.last_name,
  COUNT(*) FILTER (WHERE a.assist_type = 'TACKLE') AS tackle_assists,
  COUNT(*) FILTER (WHERE a.assist_type = 'SACK')   AS sack_assists,
  COUNT(*) FILTER (WHERE a.assist_type = 'COV')    AS coverage_assists`;

/** Everyone else who was in on a play, from the defense_assists rows. */
export const assistsByPlayer = (db: Database, filters: ReportFilters) =>
  joinedRows<AssistLine>(
    db, defensive(filters), BY_ASSIST,
    `defense_assists a
     JOIN snaps s   ON s.id = a.snap_id
     JOIN players p ON p.id = a.player_id`,
    [],
    'GROUP BY p.id ORDER BY tackle_assists DESC, sack_assists DESC',
  );
