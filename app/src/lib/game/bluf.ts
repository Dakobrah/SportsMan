/**
 * BLUF ("bottom line up front") summaries — the one-line verdict shown at the
 * top of each report section.
 *
 * Ported from the five `compute_*_bluf` functions in
 * `apps/core/helpers.py`. Those repeated the same count-and-pluralise
 * construction a dozen times; `unit()` below does it once.
 */

/** "1 TD" / "2 TDs" — the plural defaults to the singular plus "s". */
export function unit(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Join the non-empty parts of a summary. */
const sentence = (parts: string[]): string => parts.filter(Boolean).join(', ');

export interface RushingTotals {
  attempts?: number;
  yards?: number;
  touchdowns?: number;
}

export function rushingBluf(data: RushingTotals): string {
  if (!data.attempts) return 'No rushing attempts.';
  return sentence([
    `${data.yards ?? 0} rushing yards`,
    data.touchdowns ? unit(data.touchdowns, 'TD') : '',
  ]);
}

export interface PassingTotals {
  attempts?: number;
  yards?: number;
  touchdowns?: number;
  interceptions?: number;
}

export function passingBluf(data: PassingTotals): string {
  if (!data.attempts) return 'No passing attempts.';
  return sentence([
    `${data.yards ?? 0} passing yards`,
    data.touchdowns ? unit(data.touchdowns, 'TD') : '',
    data.interceptions ? unit(data.interceptions, 'INT') : '',
  ]);
}

export interface DefenseTotals {
  total_tackles?: number;
  total_tfl?: number;
  total_sacks?: number;
  total_interceptions?: number;
  defensive_touchdowns?: number;
}

export function defenseBluf(data: DefenseTotals): string {
  const tackles = data.total_tackles ?? 0;
  const tfl = data.total_tfl ?? 0;
  const sacks = data.total_sacks ?? 0;
  const interceptions = data.total_interceptions ?? 0;
  const defensiveTouchdowns = data.defensive_touchdowns ?? 0;

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

export interface FieldGoalTotals {
  attempts?: number;
  made?: number;
  longest?: number | null;
  percentage?: number;
}

export function fieldGoalBluf(data: FieldGoalTotals): string {
  if (!data.attempts) return 'No field goal attempts.';
  return sentence([
    `${data.made ?? 0}/${data.attempts} on field goals`,
    data.longest != null ? `longest ${data.longest} yards` : '',
    `${(data.percentage ?? 0).toFixed(1)}%`,
  ]);
}

export interface PuntTotals {
  punts?: number;
  avg_yards?: number;
  longest?: number;
}

export function puntBluf(data: PuntTotals): string {
  if (!data.punts) return 'No punts.';
  return `${data.punts} punts, ${(data.avg_yards ?? 0).toFixed(1)} avg, longest ${data.longest ?? 0}`;
}
