/**
 * Team-level aggregates.
 *
 * One row per call, over one table. `FILTER (WHERE ...)` partitions by kind
 * and flag in a single pass, which is what makes the Django report services
 * transliterate directly onto the flattened schema.
 *
 * Everything here counts what is stored. Percentages, ratings and points are
 * rules, and rules live in lib/reports.
 */
import type { Database } from '../driver';
import { toDomain, toDomainAll } from '../repositories/types';
import {
  EXPLOSIVE_PASS_YARDS,
  EXPLOSIVE_RUN_YARDS,
  GAIN_SQL,
  TO_GOAL_SQL,
  gainSql,
  type ReportFilters,
  snapWhere,
} from './filters';

export interface TeamTotals {
  scrimmagePlays: number;
  rushAttempts: number;
  rushYards: number;
  rushTouchdowns: number;
  rushFirstDowns: number;
  /** Null with no carries, which is different from a longest of zero. */
  rushLongest: number | null;
  passAttempts: number;
  completions: number;
  passYards: number;
  passTouchdowns: number;
  passFirstDowns: number;
  passLongest: number | null;
  interceptions: number;
  sacks: number;
  /** Negative, as stored. */
  sackYards: number;
  fumbles: number;
  fumblesLost: number;
  explosiveRuns: number;
  explosivePasses: number;
  penalties: number;
  penaltyYards: number;
}

export async function teamTotals(
  db: Database,
  filters: ReportFilters,
): Promise<TeamTotals> {
  const where = snapWhere(filters);
  const row = await db.get<Record<string, unknown>>(
    `SELECT
       COUNT(*) FILTER (WHERE kind IN ('RUN', 'PASS'))                              AS scrimmage_plays,

       COUNT(*) FILTER (WHERE kind = 'RUN')                                         AS rush_attempts,
       COALESCE(SUM(yards_gained) FILTER (WHERE kind = 'RUN'), 0)                    AS rush_yards,
       COUNT(*) FILTER (WHERE kind = 'RUN' AND is_touchdown = 1)                     AS rush_touchdowns,
       COUNT(*) FILTER (WHERE kind = 'RUN' AND is_first_down = 1)                    AS rush_first_downs,
       MAX(yards_gained) FILTER (WHERE kind = 'RUN')                                 AS rush_longest,

       -- A sack is a PASS row but NOT a pass attempt. Counting it inflates the
       -- denominator of completion %, yards per attempt and every passer-rating
       -- component -- the same correction offense.py::get_passing_totals carries.
       COUNT(*) FILTER (WHERE kind = 'PASS' AND was_sacked = 0)                      AS pass_attempts,
       COUNT(*) FILTER (WHERE kind = 'PASS' AND is_complete = 1)                     AS completions,
       COALESCE(SUM(yards_gained) FILTER (WHERE kind = 'PASS' AND is_complete = 1), 0) AS pass_yards,
       COUNT(*) FILTER (WHERE kind = 'PASS' AND is_touchdown = 1)                    AS pass_touchdowns,
       COUNT(*) FILTER (WHERE kind = 'PASS' AND is_first_down = 1)                   AS pass_first_downs,
       MAX(yards_gained) FILTER (WHERE kind = 'PASS' AND is_complete = 1)            AS pass_longest,
       COUNT(*) FILTER (WHERE kind = 'PASS' AND is_interception = 1)                 AS interceptions,
       COUNT(*) FILTER (WHERE kind = 'PASS' AND was_sacked = 1)                      AS sacks,
       COALESCE(SUM(sack_yards) FILTER (WHERE kind = 'PASS' AND was_sacked = 1), 0)  AS sack_yards,

       COUNT(*) FILTER (WHERE fumbled = 1)                                           AS fumbles,
       COUNT(*) FILTER (WHERE fumble_lost = 1)                                       AS fumbles_lost,

       COUNT(*) FILTER (WHERE kind = 'RUN' AND yards_gained >= ${EXPLOSIVE_RUN_YARDS})  AS explosive_runs,
       COUNT(*) FILTER (WHERE kind = 'PASS' AND is_complete = 1
                          AND yards_gained >= ${EXPLOSIVE_PASS_YARDS})                AS explosive_passes,

       COUNT(*) FILTER (WHERE had_penalty = 1)                                       AS penalties,
       COALESCE(SUM(penalty_yards) FILTER (WHERE had_penalty = 1), 0)                AS penalty_yards
     FROM snaps
     WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<TeamTotals>(row ?? {});
}

export interface DownRow {
  down: number;
  plays: number;
  yards: number;
  converted: number;
}

/**
 * Plays and conversions by down.
 *
 * A conversion is primarily the yardage the play gained: `is_first_down` is
 * an optional checkbox a coach usually leaves alone, so it acts as an
 * override for what only they know -- a defensive penalty, a spot call --
 * rather than as the definition. The `distance > 0` guard stops a goal-to-go
 * snap at 1st and 0 counting as an automatic conversion; there, only a
 * touchdown converts.
 */
export async function downEfficiency(
  db: Database,
  filters: ReportFilters,
): Promise<DownRow[]> {
  const where = snapWhere(filters, [
    "kind IN ('RUN', 'PASS')",
    'down IS NOT NULL',
    'distance IS NOT NULL',
  ]);
  return toDomainAll<DownRow>(
    await db.all(
      `SELECT down,
              COUNT(*)                      AS plays,
              COALESCE(SUM(${GAIN_SQL}), 0) AS yards,
              COUNT(*) FILTER (WHERE is_touchdown = 1
                                  OR is_first_down = 1
                                  OR (distance > 0 AND ${GAIN_SQL} >= distance)) AS converted
       FROM snaps
       WHERE ${where.sql}
       GROUP BY down
       ORDER BY down`,
      where.params,
    ),
  );
}

export type FieldZone = 'red' | 'fringe' | 'midfield' | 'own';

export interface ZoneRow {
  zone: FieldZone;
  plays: number;
  yards: number;
  touchdowns: number;
}

/** Snaps bucketed by how far the possessing team was from the goal. */
export async function fieldZones(
  db: Database,
  filters: ReportFilters,
): Promise<ZoneRow[]> {
  const where = snapWhere(filters, ["kind IN ('RUN', 'PASS')", 'ball_position IS NOT NULL']);
  const rows = await toDomainAll<ZoneRow>(
    await db.all(
      // 20 matches field.isRedZoneFor.
      `SELECT CASE
                WHEN ${TO_GOAL_SQL} <= 20 THEN 'red'
                WHEN ${TO_GOAL_SQL} <= 40 THEN 'fringe'
                WHEN ${TO_GOAL_SQL} <= 60 THEN 'midfield'
                ELSE 'own'
              END                           AS zone,
              COUNT(*)                      AS plays,
              COALESCE(SUM(${GAIN_SQL}), 0) AS yards,
              COUNT(*) FILTER (WHERE is_touchdown = 1) AS touchdowns
       FROM snaps
       WHERE ${where.sql}
       GROUP BY zone`,
      where.params,
    ),
  );

  // A fixed order, so a chart's x-axis does not reorder itself by which
  // zones happen to have plays.
  const order: FieldZone[] = ['own', 'midfield', 'fringe', 'red'];
  return order
    .map((zone) => rows.find((r) => r.zone === zone) ?? { zone, plays: 0, yards: 0, touchdowns: 0 })
    .filter((row) => row.plays > 0);
}

export interface YardageBucketRow {
  bucket: string;
  runs: number;
  passes: number;
}

/** How gains were distributed. Buckets are named, not computed, so the
 *  chart's axis is stable across games. */
export async function yardageBuckets(
  db: Database,
  filters: ReportFilters,
): Promise<YardageBucketRow[]> {
  const where = snapWhere(filters, ["kind IN ('RUN', 'PASS')"]);
  const rows = await toDomainAll<YardageBucketRow>(
    await db.all(
      `SELECT CASE
                WHEN ${GAIN_SQL} < 0  THEN 'loss'
                WHEN ${GAIN_SQL} = 0  THEN 'none'
                WHEN ${GAIN_SQL} < 5  THEN '1-4'
                WHEN ${GAIN_SQL} < 10 THEN '5-9'
                WHEN ${GAIN_SQL} < 20 THEN '10-19'
                ELSE '20+'
              END AS bucket,
              COUNT(*) FILTER (WHERE kind = 'RUN')  AS runs,
              COUNT(*) FILTER (WHERE kind = 'PASS') AS passes
       FROM snaps
       WHERE ${where.sql}
       GROUP BY bucket`,
      where.params,
    ),
  );

  const order = ['loss', 'none', '1-4', '5-9', '10-19', '20+'];
  return order.map(
    (bucket) => rows.find((r) => r.bucket === bucket) ?? { bucket, runs: 0, passes: 0 },
  );
}

export interface TendencyRow {
  formation: string;
  plays: number;
  runs: number;
  passes: number;
  yards: number;
  /** Share of plays from this formation that were runs, 0-100. */
  runPct: number;
}

/**
 * What we do from each formation.
 *
 * The report the whole play-call feature exists for: a coach wants to know
 * they run 80% of the time from I Formation before an opponent works it out.
 * Grouped on the formation TEXT stored on the snap rather than joined to the
 * playbook, so editing or reimporting a playbook cannot rewrite history.
 */
export async function tendencies(
  db: Database,
  filters: ReportFilters,
): Promise<TendencyRow[]> {
  const where = snapWhere(filters, ["kind IN ('RUN', 'PASS')", "formation <> ''"]);
  const rows = await toDomainAll<Omit<TendencyRow, 'runPct'>>(
    await db.all(
      `SELECT formation,
              COUNT(*)                              AS plays,
              COUNT(*) FILTER (WHERE kind = 'RUN')  AS runs,
              COUNT(*) FILTER (WHERE kind = 'PASS') AS passes,
              COALESCE(SUM(${GAIN_SQL}), 0)         AS yards
       FROM snaps WHERE ${where.sql}
       GROUP BY formation
       ORDER BY plays DESC, formation`,
      where.params,
    ),
  );
  return rows.map((row) => ({
    ...row,
    runPct: row.plays === 0 ? 0 : (row.runs / row.plays) * 100,
  }));
}

export interface PlayCallRow {
  formation: string;
  name: string;
  calls: number;
  yards: number;
}

/** The individual calls, most used first. */
export async function playCalls(
  db: Database,
  filters: ReportFilters,
): Promise<PlayCallRow[]> {
  const where = snapWhere(filters, ["s.kind IN ('RUN', 'PASS')", 's.play_id IS NOT NULL'], 's.');
  return toDomainAll<PlayCallRow>(
    await db.all(
      `SELECT p.formation, p.name,
              COUNT(*)                        AS calls,
              COALESCE(SUM(${gainSql('s.')}), 0)  AS yards
       FROM snaps s JOIN plays p ON p.id = s.play_id
       WHERE ${where.sql}
       GROUP BY p.id
       ORDER BY calls DESC, yards DESC`,
      where.params,
    ),
  );
}
