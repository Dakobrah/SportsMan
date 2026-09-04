/** Kicking and punting aggregates. */
import type { Database } from '../driver';
import { toDomain, toDomainAll } from '../repositories/types';
import { type ReportFilters, snapWhere } from './filters';

export interface FieldGoalTotals {
  attempts: number;
  made: number;
  missed: number;
  blocked: number;
  /** The longest MADE kick. Null when none was made. */
  longest: number | null;
}

export async function fieldGoalTotals(
  db: Database,
  filters: ReportFilters,
): Promise<FieldGoalTotals> {
  const where = snapWhere(filters, ["kind = 'FG'"]);
  const row = await db.get<Record<string, unknown>>(
    `SELECT COUNT(*)                                              AS attempts,
            COUNT(*) FILTER (WHERE result = 'GOOD')               AS made,
            COUNT(*) FILTER (WHERE result = 'MISS')               AS missed,
            COUNT(*) FILTER (WHERE result = 'BLOCK')              AS blocked,
            MAX(kick_distance) FILTER (WHERE result = 'GOOD')     AS longest
     FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<FieldGoalTotals>(row ?? {});
}

export interface FieldGoalBand {
  band: string;
  attempts: number;
  made: number;
}

/** Made/attempted by distance. Bands are named so the axis is stable. */
export async function fieldGoalsByDistance(
  db: Database,
  filters: ReportFilters,
): Promise<FieldGoalBand[]> {
  const where = snapWhere(filters, ["kind = 'FG'", 'kick_distance IS NOT NULL']);
  const rows = await toDomainAll<FieldGoalBand>(
    await db.all(
      `SELECT CASE
                WHEN kick_distance < 30 THEN 'under 30'
                WHEN kick_distance < 40 THEN '30-39'
                WHEN kick_distance < 50 THEN '40-49'
                ELSE '50+'
              END AS band,
              COUNT(*)                                AS attempts,
              COUNT(*) FILTER (WHERE result = 'GOOD') AS made
       FROM snaps WHERE ${where.sql} GROUP BY band`,
      where.params,
    ),
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

export async function puntTotals(
  db: Database,
  filters: ReportFilters,
): Promise<PuntTotals> {
  const where = snapWhere(filters, ["kind = 'PUNT'"]);
  const row = await db.get<Record<string, unknown>>(
    `SELECT COUNT(*)                                     AS punts,
            COALESCE(SUM(punt_yards), 0)                 AS yards,
            MAX(punt_yards)                              AS longest,
            COUNT(*) FILTER (WHERE is_touchback = 1)     AS touchbacks,
            COUNT(*) FILTER (WHERE is_blocked = 1)       AS blocked,
            COUNT(*) FILTER (WHERE out_of_bounds = 1)    AS out_of_bounds
     FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<PuntTotals>(row ?? {});
}

export interface KickoffTotals {
  kickoffs: number;
  yards: number;
  touchbacks: number;
  onsideAttempts: number;
  outOfBounds: number;
}

export async function kickoffTotals(
  db: Database,
  filters: ReportFilters,
): Promise<KickoffTotals> {
  const where = snapWhere(filters, ["kind = 'KICKOFF'"]);
  const row = await db.get<Record<string, unknown>>(
    `SELECT COUNT(*)                                       AS kickoffs,
            COALESCE(SUM(kick_yards), 0)                   AS yards,
            COUNT(*) FILTER (WHERE is_touchback = 1)       AS touchbacks,
            COUNT(*) FILTER (WHERE is_onside_kick = 1)     AS onside_attempts,
            COUNT(*) FILTER (WHERE out_of_bounds = 1)      AS out_of_bounds
     FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<KickoffTotals>(row ?? {});
}

export interface ExtraPointTotals {
  patAttempts: number;
  patMade: number;
  twoPointAttempts: number;
  twoPointMade: number;
}

export async function extraPointTotals(
  db: Database,
  filters: ReportFilters,
): Promise<ExtraPointTotals> {
  const where = snapWhere(filters, ["kind = 'XP'"]);
  const row = await db.get<Record<string, unknown>>(
    `SELECT COUNT(*) FILTER (WHERE attempt_type = 'KICK')   AS pat_attempts,
            COUNT(*) FILTER (WHERE attempt_type = 'KICK' AND result = 'GOOD')
                                                            AS pat_made,
            COUNT(*) FILTER (WHERE attempt_type <> 'KICK')  AS two_point_attempts,
            COUNT(*) FILTER (WHERE attempt_type <> 'KICK' AND result = 'GOOD')
                                                            AS two_point_made
     FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<ExtraPointTotals>(row ?? {});
}
