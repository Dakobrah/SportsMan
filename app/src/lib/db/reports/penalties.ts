/**
 * Penalty aggregates.
 *
 * Scoped on `had_penalty = 1` rather than `kind = 'PENALTY'`, so that if a
 * penalty is ever flagged on another snap it is counted without this module
 * changing.
 */
import type { Database } from '../driver';
import { toDomain, toDomainAll } from '../repositories/types';
import { type ReportFilters, snapWhere } from './filters';

export interface PenaltyTotals {
  penalties: number;
  yards: number;
  accepted: number;
  declined: number;
  onOffense: number;
  onDefense: number;
}

export async function penaltyTotals(
  db: Database,
  filters: ReportFilters,
): Promise<PenaltyTotals> {
  const where = snapWhere(filters, ['had_penalty = 1']);
  const row = await db.get<Record<string, unknown>>(
    `SELECT COUNT(*)                                            AS penalties,
            COALESCE(SUM(penalty_yards), 0)                     AS yards,
            COUNT(*) FILTER (WHERE penalty_accepted = 1)        AS accepted,
            COUNT(*) FILTER (WHERE penalty_accepted = 0)        AS declined,
            COUNT(*) FILTER (WHERE penalty_on_offense = 1)      AS on_offense,
            COUNT(*) FILTER (WHERE penalty_on_offense = 0)      AS on_defense
     FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<PenaltyTotals>(row ?? {});
}

export interface PenaltyRow {
  name: string;
  count: number;
  yards: number;
}

export async function penaltiesByName(
  db: Database,
  filters: ReportFilters,
): Promise<PenaltyRow[]> {
  const where = snapWhere(filters, ['had_penalty = 1', "penalty_description <> ''"]);
  return toDomainAll<PenaltyRow>(
    await db.all(
      `SELECT penalty_description             AS name,
              COUNT(*)                        AS count,
              COALESCE(SUM(penalty_yards), 0) AS yards
       FROM snaps WHERE ${where.sql}
       GROUP BY penalty_description
       ORDER BY count DESC, yards DESC, name`,
      where.params,
    ),
  );
}
