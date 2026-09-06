/**
 * Penalty aggregates.
 *
 * Scoped on `had_penalty = 1` rather than `kind = 'PENALTY'`, so that if a
 * penalty is ever flagged on another snap it is counted without this module
 * changing.
 */
import type { Database } from '../driver';
import type { ReportFilters } from './filters';
import { aggregateRow, aggregateRows } from './query';

export interface PenaltyTotals {
  penalties: number;
  yards: number;
  accepted: number;
  declined: number;
  onOffense: number;
  onDefense: number;
}

const PENALTIES = `
  COUNT(*)                                       AS penalties,
  COALESCE(SUM(penalty_yards), 0)                AS yards,
  COUNT(*) FILTER (WHERE penalty_accepted = 1)   AS accepted,
  COUNT(*) FILTER (WHERE penalty_accepted = 0)   AS declined,
  COUNT(*) FILTER (WHERE penalty_on_offense = 1) AS on_offense,
  COUNT(*) FILTER (WHERE penalty_on_offense = 0) AS on_defense`;

export const penaltyTotals = (db: Database, filters: ReportFilters) =>
  aggregateRow<PenaltyTotals>(db, filters, PENALTIES, ['had_penalty = 1']);

export interface PenaltyRow {
  name: string;
  count: number;
  yards: number;
}

const BY_NAME = `
  penalty_description             AS name,
  COUNT(*)                        AS count,
  COALESCE(SUM(penalty_yards), 0) AS yards`;

export const penaltiesByName = (db: Database, filters: ReportFilters) =>
  aggregateRows<PenaltyRow>(
    db, filters, BY_NAME,
    ['had_penalty = 1', "penalty_description <> ''"],
    'GROUP BY penalty_description ORDER BY count DESC, yards DESC, name',
  );
