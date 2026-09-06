/**
 * Points, derived from the plays.
 *
 * The `quarter_scores` table exists but nothing writes it, so a game's
 * quarter-by-quarter line has always rendered empty. Folding `pointsForSnap`
 * over the snaps is better than filling that table anyway: the plays are the
 * single source of truth, and there is no second copy to fall out of step.
 */
import type { Snap } from '../db/repositories/types';
import { pointsForSnap } from '../game/score';

export interface QuarterPoints {
  quarter: number;
  us: number;
  them: number;
}

export function pointsByQuarter(snaps: Snap[]): QuarterPoints[] {
  const byQuarter = new Map<number, QuarterPoints>();

  for (const snap of snaps) {
    const points = pointsForSnap(snap);
    if (points === 0) continue;

    const row = byQuarter.get(snap.quarter) ?? { quarter: snap.quarter, us: 0, them: 0 };
    // Credited to whoever had the ball, never to us by default.
    if (snap.possession === 'us') row.us += points;
    else row.them += points;
    byQuarter.set(snap.quarter, row);
  }

  // Quarters with no scoring still belong on the line, up to the last one played.
  const lastQuarter = snaps.reduce((max, s) => Math.max(max, s.quarter), 0);
  const out: QuarterPoints[] = [];
  for (let quarter = 1; quarter <= lastQuarter; quarter++) {
    out.push(byQuarter.get(quarter) ?? { quarter, us: 0, them: 0 });
  }
  return out;
}

export interface ScorePoint {
  sequenceNumber: number;
  quarter: number;
  us: number;
  them: number;
}

/** The running score after every scoring play, for a trend line. */
export function runningScore(snaps: Snap[]): ScorePoint[] {
  const out: ScorePoint[] = [];
  let us = 0;
  let them = 0;

  for (const snap of snaps) {
    const points = pointsForSnap(snap);
    if (points === 0) continue;
    if (snap.possession === 'us') us += points;
    else them += points;
    out.push({ sequenceNumber: snap.sequenceNumber, quarter: snap.quarter, us, them });
  }
  return out;
}
