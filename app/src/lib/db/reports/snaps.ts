/**
 * Snaps for a report.
 *
 * Returns FULL rows rather than a projection, so drive segmentation and
 * scoring can reuse `cursorAfter`, `snapYardage` and `pointsForSnap`
 * unchanged instead of a parallel shape that would drift. A game is about
 * 180 rows and a season about 2,200 -- the same order `Plays.svelte`
 * already loads.
 */
import type { Database } from '../driver';
import { BOOLEAN_COLUMNS, type Snap, toDomainAll } from '../repositories/types';
import { type ReportFilters, snapWhere } from './filters';

export async function reportSnaps(
  db: Database,
  filters: ReportFilters,
): Promise<Snap[]> {
  const where = snapWhere(filters);
  return toDomainAll<Snap>(
    await db.all(
      `SELECT * FROM snaps WHERE ${where.sql} ORDER BY game_id, sequence_number`,
      where.params,
    ),
    BOOLEAN_COLUMNS.snaps,
  );
}
