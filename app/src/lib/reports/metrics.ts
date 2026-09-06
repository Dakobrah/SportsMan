/**
 * Rates and ratings.
 *
 * The SQL layer counts what is stored; this turns those counts into the
 * numbers a coach reads. Nothing here touches a database.
 */
import type { TeamTotals } from '../db/reports/team';

/** Zero denominator yields zero, never NaN or Infinity. */
export const rate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

export const percent = (numerator: number, denominator: number): number =>
  rate(numerator, denominator) * 100;

const clampComponent = (value: number): number => Math.min(Math.max(value, 0), 2.375);

/**
 * The standard NFL passer rating.
 *
 * Deliberately NOT rounded here. Django rounded inside the equivalent
 * function, which makes a chart and its exported table disagree about the
 * same number; round at the render boundary instead.
 */
export function passerRating(stats: {
  attempts: number;
  completions: number;
  yards: number;
  touchdowns: number;
  interceptions: number;
}): number {
  if (stats.attempts === 0) return 0;

  const a = clampComponent((stats.completions / stats.attempts - 0.3) * 5);
  const b = clampComponent((stats.yards / stats.attempts - 3) / 4);
  const c = clampComponent((stats.touchdowns / stats.attempts) * 20);
  const d = clampComponent(2.375 - (stats.interceptions / stats.attempts) * 25);

  return ((a + b + c + d) / 6) * 100;
}

export interface DerivedOffense {
  totalYards: number;
  /** Passing yards after sack losses. `sackYards` is stored negative. */
  netPassYards: number;
  completionPct: number;
  yardsPerAttempt: number;
  yardsPerCarry: number;
  yardsPerPlay: number;
  passerRating: number;
  turnovers: number;
}

export function deriveOffense(t: TeamTotals): DerivedOffense {
  // Gross passing yards, matching the box score the replay test pins. Net is
  // reported alongside it rather than silently replacing it.
  const totalYards = t.rushYards + t.passYards;
  return {
    totalYards,
    netPassYards: t.passYards + t.sackYards,
    completionPct: percent(t.completions, t.passAttempts),
    yardsPerAttempt: rate(t.passYards, t.passAttempts),
    yardsPerCarry: rate(t.rushYards, t.rushAttempts),
    yardsPerPlay: rate(totalYards, t.scrimmagePlays),
    passerRating: passerRating({
      attempts: t.passAttempts,
      completions: t.completions,
      yards: t.passYards,
      touchdowns: t.passTouchdowns,
      interceptions: t.interceptions,
    }),
    turnovers: t.interceptions + t.fumblesLost,
  };
}

export interface Conversion {
  down: number;
  attempts: number;
  converted: number;
  pct: number;
}

export const conversions = (
  rows: { down: number; plays: number; converted: number }[],
): Conversion[] =>
  rows.map((row) => ({
    down: row.down,
    attempts: row.plays,
    converted: row.converted,
    pct: percent(row.converted, row.plays),
  }));

export interface TurnoverMargin {
  giveaways: number;
  takeaways: number;
  margin: number;
}

/**
 * Our turnovers against theirs.
 *
 * `them` is the opponent's offense, so their interceptions and lost fumbles
 * are our takeaways. That one substitution is how a single-team app reports
 * a defensive statistic at all.
 */
export function turnoverMargin(us: TeamTotals, them: TeamTotals): TurnoverMargin {
  const giveaways = us.interceptions + us.fumblesLost;
  const takeaways = them.interceptions + them.fumblesLost;
  return { giveaways, takeaways, margin: takeaways - giveaways };
}
