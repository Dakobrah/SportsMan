import { describe, expect, it } from 'vitest';
import {
  conversions, deriveOffense, passerRating, percent, rate, turnoverMargin,
} from '../../src/lib/reports/metrics';
import type { TeamTotals } from '../../src/lib/db/reports/team';

const totals = (o: Partial<TeamTotals> = {}): TeamTotals => ({
  scrimmagePlays: 0, rushAttempts: 0, rushYards: 0, rushTouchdowns: 0,
  rushFirstDowns: 0, rushLongest: null, passAttempts: 0, completions: 0,
  passYards: 0, passTouchdowns: 0, passFirstDowns: 0, passLongest: null,
  interceptions: 0, sacks: 0, sackYards: 0, fumbles: 0, fumblesLost: 0,
  explosiveRuns: 0, explosivePasses: 0, penalties: 0, penaltyYards: 0,
  ...o,
});

describe('rates', () => {
  it('never divides by zero', () => {
    expect(rate(5, 0)).toBe(0);
    expect(percent(5, 0)).toBe(0);
    expect(Number.isFinite(percent(0, 0))).toBe(true);
  });

  it('computes the obvious cases', () => {
    expect(rate(10, 4)).toBe(2.5);
    expect(percent(1, 4)).toBe(25);
  });
});

describe('passer rating', () => {
  it('is zero with no attempts', () => {
    expect(passerRating({ attempts: 0, completions: 0, yards: 0, touchdowns: 0, interceptions: 0 }))
      .toBe(0);
  });

  it('clamps a perfect game at 158.3', () => {
    // Every component pinned at its 2.375 ceiling.
    const rating = passerRating({
      attempts: 10, completions: 10, yards: 200, touchdowns: 5, interceptions: 0,
    });
    expect(rating).toBeCloseTo(158.33, 1);
  });

  it('clamps the floor at zero rather than going negative', () => {
    const rating = passerRating({
      attempts: 10, completions: 0, yards: 0, touchdowns: 0, interceptions: 10,
    });
    expect(rating).toBe(0);
  });

  it('matches a line worked out by hand', () => {
    // 24/38, 258 yards, 2 TD, 2 INT -- the real WAS passing line from the
    // replayed game. a=1.65789 b=0.94737 c=1.05263 d=1.05921, so
    // ((a+b+c+d)/6)*100 = 78.6184.
    expect(passerRating({
      attempts: 38, completions: 24, yards: 258, touchdowns: 2, interceptions: 2,
    })).toBeCloseTo(78.6184, 3);
  });

  it('does not round, so a chart and its export agree', () => {
    const rating = passerRating({
      attempts: 3, completions: 2, yards: 25, touchdowns: 0, interceptions: 0,
    });
    expect(rating).not.toBe(Math.round(rating * 10) / 10);
  });
});

describe('deriveOffense', () => {
  it('reports gross and net passing yards separately', () => {
    const d = deriveOffense(totals({ passYards: 258, sackYards: -14, rushYards: 113 }));
    // Gross is the number the box score and the replay test pin.
    expect(d.totalYards).toBe(371);
    expect(d.netPassYards).toBe(244);
  });

  it('is all zeros for a game with no plays', () => {
    const d = deriveOffense(totals());
    expect(d).toMatchObject({
      totalYards: 0, completionPct: 0, yardsPerAttempt: 0,
      yardsPerCarry: 0, yardsPerPlay: 0, passerRating: 0, turnovers: 0,
    });
  });

  it('counts both kinds of turnover', () => {
    expect(deriveOffense(totals({ interceptions: 2, fumblesLost: 1 })).turnovers).toBe(3);
  });
});

describe('conversions', () => {
  it('adds a percentage per down', () => {
    expect(conversions([{ down: 3, plays: 13, converted: 7 }])[0]).toMatchObject({
      down: 3, attempts: 13, converted: 7,
    });
    expect(conversions([{ down: 3, plays: 13, converted: 7 }])[0].pct).toBeCloseTo(53.85, 1);
  });

  it('survives a down with no attempts', () => {
    expect(conversions([{ down: 4, plays: 0, converted: 0 }])[0].pct).toBe(0);
  });
});

describe('turnoverMargin', () => {
  it('treats their turnovers as our takeaways', () => {
    const us = totals({ interceptions: 2, fumblesLost: 3 });
    const them = totals({ interceptions: 1, fumblesLost: 1 });
    expect(turnoverMargin(us, them)).toEqual({ giveaways: 5, takeaways: 2, margin: -3 });
  });

  it('is positive when we take more than we give', () => {
    expect(turnoverMargin(totals({ interceptions: 1 }), totals({ interceptions: 3 })).margin).toBe(2);
  });
});
