/**
 * Scoping a report.
 *
 * Every report query is a single-table aggregate over `snaps`, which is what
 * the flattened schema was designed for. This builds the WHERE clause they
 * all share, and holds the three rules that are pushed down into SQL.
 */
import type { Possession } from '../../game/field';

export interface ReportFilters {
  /** Explicit games. An EMPTY array means "no games", not "all games". */
  gameIds?: number[];
  /** Every game of a season. ANDed with `gameIds` when both are given. */
  seasonId?: number;
  /** Which side ran the play. 'us' is our offense; 'them' is our defense. */
  possession?: Possession;
}

export interface Where {
  sql: string;
  params: unknown[];
}

/**
 * Three rules live in SQL as well as TypeScript, so each has a parity test
 * against its twin. That is the same arrangement `score.ts` uses for
 * `pointsFor`/`pointsForSnap`: duplication is fine as long as a test makes
 * the two unable to drift.
 */

/**
 * Yards a snap actually moved the ball. SQL twin of `summary.snapYardage`.
 *
 * `alias` is '' for a plain `FROM snaps` and 's.' when joined, so the two
 * forms cannot drift apart the way string-substituting one into the other
 * would allow.
 */
export const gainSql = (alias = ''): string =>
  `(CASE WHEN ${alias}kind = 'PASS' AND ${alias}was_sacked = 1` +
  ` THEN ${alias}sack_yards ELSE ${alias}yards_gained END)`;

export const GAIN_SQL = gainSql();

/** Distance to the goal the possessing team attacks. Twin of `field.yardsToGoalFor`. */
export const TO_GOAL_SQL =
  "(CASE WHEN possession = 'us' THEN 50 - ball_position ELSE ball_position + 50 END)";

/** A run of this many yards or more is explosive. */
export const EXPLOSIVE_RUN_YARDS = 10;
/** A completion of this many yards or more is explosive. */
export const EXPLOSIVE_PASS_YARDS = 15;

/**
 * The shared WHERE clause.
 *
 * `alias` is '' for a plain `FROM snaps` and 's.' when joined to players.
 * `extra` holds predicates the caller adds; they are literal SQL, never
 * user input, and are ANDed in.
 */
export function snapWhere(
  filters: ReportFilters,
  extra: string[] = [],
  alias = '',
): Where {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.gameIds) {
    if (filters.gameIds.length === 0) {
      // SQLite does accept `IN ()`, but that is an extension and reads as a
      // mistake. `0` says "match nothing" without relying on it.
      where.push('0');
    } else {
      where.push(`${alias}game_id IN (${filters.gameIds.map(() => '?').join(', ')})`);
      params.push(...filters.gameIds);
    }
  }

  if (filters.seasonId != null) {
    // A subquery rather than a join: `snaps` has no season column, and a
    // join would force every aggregate into a two-table shape. This uses
    // idx_games_season.
    where.push(`${alias}game_id IN (SELECT id FROM games WHERE season_id = ?)`);
    params.push(filters.seasonId);
  }

  if (filters.possession) {
    where.push(`${alias}possession = ?`);
    params.push(filters.possession);
  }

  where.push(...extra);

  return { sql: where.length ? where.join(' AND ') : '1', params };
}
