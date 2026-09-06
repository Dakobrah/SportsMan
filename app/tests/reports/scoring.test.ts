import { describe, expect, it } from 'vitest';
import { pointsByQuarter, runningScore } from '../../src/lib/reports/scoring';
import { makeSnap } from '../support/snapFixture';
import type { Snap } from '../../src/lib/db/repositories/types';

const td = (quarter: number, possession: Snap['possession'], sequenceNumber = 1) =>
  makeSnap({ kind: 'RUN', quarter, possession, isTouchdown: true, sequenceNumber });
const pat = (quarter: number, possession: Snap['possession'], sequenceNumber = 2) =>
  makeSnap({ kind: 'XP', quarter, possession, attemptType: 'KICK', result: 'GOOD', sequenceNumber });

describe('pointsByQuarter', () => {
  it('credits the side that had the ball', () => {
    const rows = pointsByQuarter([td(1, 'us'), pat(1, 'us'), td(1, 'them'), pat(1, 'them')]);
    expect(rows).toEqual([{ quarter: 1, us: 7, them: 7 }]);
  });

  it('never gives their points to us', () => {
    // The bug this replaces: pointsForSnap applied to our score regardless.
    expect(pointsByQuarter([td(1, 'them')])).toEqual([{ quarter: 1, us: 0, them: 6 }]);
  });

  it('includes scoreless quarters up to the last one played', () => {
    const rows = pointsByQuarter([
      td(1, 'us'),
      makeSnap({ kind: 'RUN', quarter: 3, possession: 'us' }),
    ]);
    expect(rows.map((r) => r.quarter)).toEqual([1, 2, 3]);
    expect(rows[1]).toEqual({ quarter: 2, us: 0, them: 0 });
  });

  it('is empty with no plays', () => {
    expect(pointsByQuarter([])).toEqual([]);
  });

  it('counts field goals and two-point conversions', () => {
    const rows = pointsByQuarter([
      makeSnap({ kind: 'FG', quarter: 2, possession: 'us', result: 'GOOD' }),
      makeSnap({ kind: 'XP', quarter: 2, possession: 'them', attemptType: '2PT_RUN', result: 'GOOD' }),
      makeSnap({ kind: 'FG', quarter: 2, possession: 'us', result: 'MISS' }),
    ]);
    expect(rows).toEqual([{ quarter: 1, us: 0, them: 0 }, { quarter: 2, us: 3, them: 2 }]);
  });
});

describe('runningScore', () => {
  it('accumulates only on scoring plays', () => {
    const points = runningScore([
      makeSnap({ kind: 'RUN', quarter: 1, possession: 'us', sequenceNumber: 1 }),
      td(1, 'us', 2),
      pat(1, 'us', 3),
      td(2, 'them', 4),
    ]);
    expect(points).toEqual([
      { sequenceNumber: 2, quarter: 1, us: 6, them: 0 },
      { sequenceNumber: 3, quarter: 1, us: 7, them: 0 },
      { sequenceNumber: 4, quarter: 2, us: 7, them: 6 },
    ]);
  });
});
