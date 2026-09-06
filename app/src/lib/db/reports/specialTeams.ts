/**
 * Kicking and punting aggregates.
 *
 * Each report is its SQL and nothing else: `aggregateRow` and
 * `aggregateRows` in query.ts carry the WHERE building and row conversion
 * that used to be repeated around every one of these.
 */
import type { Database } from '../driver';
import type { ReportFilters } from './filters';
import { aggregateRow, aggregateRows } from './query';

export interface FieldGoalTotals {
  attempts: number;
  made: number;
  missed: number;
  blocked: number;
  /** The longest MADE kick. Null when none was made. */
  longest: number | null;
}

const FIELD_GOALS = `
  COUNT(*)                                          AS attempts,
  COUNT(*) FILTER (WHERE result = 'GOOD')           AS made,
  COUNT(*) FILTER (WHERE result = 'MISS')           AS missed,
  COUNT(*) FILTER (WHERE result = 'BLOCK')          AS blocked,
  MAX(kick_distance) FILTER (WHERE result = 'GOOD') AS longest`;

export const fieldGoalTotals = (db: Database, filters: ReportFilters) =>
  aggregateRow<FieldGoalTotals>(db, filters, FIELD_GOALS, ["kind = 'FG'"]);

export interface FieldGoalBand {
  band: string;
  attempts: number;
  made: number;
}

const FIELD_GOAL_BANDS = `
  CASE
    WHEN kick_distance < 30 THEN 'under 30'
    WHEN kick_distance < 40 THEN '30-39'
    WHEN kick_distance < 50 THEN '40-49'
    ELSE '50+'
  END                                     AS band,
  COUNT(*)                                AS attempts,
  COUNT(*) FILTER (WHERE result = 'GOOD') AS made`;

/** Made and attempted by distance. Bands are named so the axis is stable. */
export async function fieldGoalsByDistance(
  db: Database,
  filters: ReportFilters,
): Promise<FieldGoalBand[]> {
  const rows = await aggregateRows<FieldGoalBand>(
    db, filters, FIELD_GOAL_BANDS,
    ["kind = 'FG'", 'kick_distance IS NOT NULL'],
    'GROUP BY band',
  );
  const order = ['under 30', '30-39', '40-49', '50+'];
  return order.map((band) => rows.find((r) => r.band === band) ?? { band, attempts: 0, made: 0 });
}

export interface PuntTotals {
  punts: number;
  yards: number;
  longest: number | null;
  touchbacks: number;
  blocked: number;
  outOfBounds: number;
}

const PUNTS = `
  COUNT(*)                                  AS punts,
  COALESCE(SUM(punt_yards), 0)              AS yards,
  MAX(punt_yards)                           AS longest,
  COUNT(*) FILTER (WHERE is_touchback = 1)  AS touchbacks,
  COUNT(*) FILTER (WHERE is_blocked = 1)    AS blocked,
  COUNT(*) FILTER (WHERE out_of_bounds = 1) AS out_of_bounds`;

export const puntTotals = (db: Database, filters: ReportFilters) =>
  aggregateRow<PuntTotals>(db, filters, PUNTS, ["kind = 'PUNT'"]);

export interface KickoffTotals {
  kickoffs: number;
  yards: number;
  touchbacks: number;
  onsideAttempts: number;
  outOfBounds: number;
}

const KICKOFFS = `
  COUNT(*)                                   AS kickoffs,
  COALESCE(SUM(kick_yards), 0)               AS yards,
  COUNT(*) FILTER (WHERE is_touchback = 1)   AS touchbacks,
  COUNT(*) FILTER (WHERE is_onside_kick = 1) AS onside_attempts,
  COUNT(*) FILTER (WHERE out_of_bounds = 1)  AS out_of_bounds`;

export const kickoffTotals = (db: Database, filters: ReportFilters) =>
  aggregateRow<KickoffTotals>(db, filters, KICKOFFS, ["kind = 'KICKOFF'"]);

export interface ExtraPointTotals {
  patAttempts: number;
  patMade: number;
  twoPointAttempts: number;
  twoPointMade: number;
}

const EXTRA_POINTS = `
  COUNT(*) FILTER (WHERE attempt_type = 'KICK')  AS pat_attempts,
  COUNT(*) FILTER (WHERE attempt_type = 'KICK' AND result = 'GOOD')
                                                 AS pat_made,
  COUNT(*) FILTER (WHERE attempt_type <> 'KICK') AS two_point_attempts,
  COUNT(*) FILTER (WHERE attempt_type <> 'KICK' AND result = 'GOOD')
                                                 AS two_point_made`;

export const extraPointTotals = (db: Database, filters: ReportFilters) =>
  aggregateRow<ExtraPointTotals>(db, filters, EXTRA_POINTS, ["kind = 'XP'"]);
