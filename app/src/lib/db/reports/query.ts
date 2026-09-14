/**
 * Running a report query.
 *
 * Every aggregate in this directory had the same three lines wrapped around
 * it: build the WHERE, ask for rows as `Record<string, unknown>`, convert.
 * That is here once instead, so a call site is its SQL and nothing else.
 */
import type { Database } from '../driver';
import { toDomain, toDomainAll } from '../repositories/types';
import { type ReportFilters, snapWhere } from './filters';

/**
 * One row of aggregates over `snaps`.
 *
 * An aggregate with no matching rows still returns a row of zeros and nulls,
 * so `?? {}` is a guard against an empty table rather than a real case.
 */
export async function aggregateRow<T>(
  db: Database,
  filters: ReportFilters,
  columns: string,
  extra: string[] = [],
): Promise<T> {
  const where = snapWhere(filters, extra);
  const row = await db.get<Record<string, unknown>>(
    `SELECT ${columns} FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return toDomain<T>(row ?? {});
}

/**
 * Grouped aggregates over `snaps`.
 *
 * `tail` carries the GROUP BY and ORDER BY, which differ per report and are
 * literal SQL -- never user input.
 */
export async function aggregateRows<T>(
  db: Database,
  filters: ReportFilters,
  columns: string,
  extra: string[] = [],
  tail = '',
): Promise<T[]> {
  const where = snapWhere(filters, extra);
  return toDomainAll<T>(
    await db.all(`SELECT ${columns} FROM snaps WHERE ${where.sql} ${tail}`, where.params),
  );
}

/**
 * Grouped aggregates over `snaps` joined to another table.
 *
 * `join` is the whole FROM clause, so the caller controls the alias, and
 * `snapWhere` is given that alias to match.
 */
export async function joinedRows<T>(
  db: Database,
  filters: ReportFilters,
  columns: string,
  join: string,
  extra: string[] = [],
  tail = '',
  alias = 's.',
): Promise<T[]> {
  const where = snapWhere(filters, extra, alias);
  return toDomainAll<T>(
    await db.all(`SELECT ${columns} FROM ${join} WHERE ${where.sql} ${tail}`, where.params),
  );
}
