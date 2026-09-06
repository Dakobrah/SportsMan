/**
 * BLUF ("bottom line up front") summaries — the one-line verdict shown at the
 * top of each report section.
 *
 * Ported from the five `compute_*_bluf` functions in
 * `apps/core/helpers.py`. Those repeated the same count-and-pluralise
 * construction a dozen times; `unit()` below does it once.
 *
 * The input types are named *BlufInput rather than *Totals: they describe
 * what a sentence needs, and `FieldGoalTotals`/`PuntTotals` now name real
 * aggregates over in db/reports.
 *
 * The input keys were snake_case on arrival, matching the Python. They are
 * camelCase here like every other domain type in the app -- `toDomain` in
 * db/repositories/types.ts exists precisely so snake_case stops at the
 * database boundary.
 */

/** "1 TD" / "2 TDs" — the plural defaults to the singular plus "s". */
export function unit(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Join the non-empty parts of a summary. */
const sentence = (parts: string[]): string => parts.filter(Boolean).join(', ');

export interface RushingBlufInput {
  attempts?: number;
  yards?: number;
  touchdowns?: number;
}

export function rushingBluf(data: RushingBlufInput): string {
  if (!data.attempts) return 'No rushing attempts.';
  return sentence([
    `${data.yards ?? 0} rushing yards`,
    data.touchdowns ? unit(data.touchdowns, 'TD') : '',
  ]);
}

export interface PassingBlufInput {
  attempts?: number;
  yards?: number;
  touchdowns?: number;
  interceptions?: number;
}

export function passingBluf(data: PassingBlufInput): string {
  if (!data.attempts) return 'No passing attempts.';
  return sentence([
    `${data.yards ?? 0} passing yards`,
    data.touchdowns ? unit(data.touchdowns, 'TD') : '',
    data.interceptions ? unit(data.interceptions, 'INT') : '',
  ]);
}

export interface DefenseBlufInput {
  totalTackles?: number;
  totalTfl?: number;
  totalSacks?: number;
  totalInterceptions?: number;
  defensiveTouchdowns?: number;
}

export function defenseBluf(data: DefenseBlufInput): string {
  const tackles = data.totalTackles ?? 0;
  const tfl = data.totalTfl ?? 0;
  const sacks = data.totalSacks ?? 0;
  const interceptions = data.totalInterceptions ?? 0;
  const defensiveTouchdowns = data.defensiveTouchdowns ?? 0;

  if (!tackles && !tfl && !sacks && !interceptions) {
    return 'No defensive stats recorded.';
  }

  const highlights = sentence([
    defensiveTouchdowns ? unit(defensiveTouchdowns, 'defensive TD') : '',
    sacks ? unit(sacks, 'sack') : '',
    interceptions ? unit(interceptions, 'INT') : '',
  ]);

  // Nothing headline-worthy happened, so lead with the tackle count.
  return highlights || `${tackles} total tackles`;
}

export interface FieldGoalBlufInput {
  attempts?: number;
  made?: number;
  longest?: number | null;
  percentage?: number;
}

export function fieldGoalBluf(data: FieldGoalBlufInput): string {
  if (!data.attempts) return 'No field goal attempts.';
  return sentence([
    `${data.made ?? 0}/${data.attempts} on field goals`,
    data.longest != null ? `longest ${data.longest} yards` : '',
    `${(data.percentage ?? 0).toFixed(1)}%`,
  ]);
}

export interface PuntBlufInput {
  punts?: number;
  avgYards?: number;
  longest?: number;
}

export function puntBluf(data: PuntBlufInput): string {
  if (!data.punts) return 'No punts.';
  return `${data.punts} punts, ${(data.avgYards ?? 0).toFixed(1)} avg, longest ${data.longest ?? 0}`;
}
