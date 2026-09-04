/** Ported from tests/unit/test_report_bluf.py. */
import { describe, expect, it } from 'vitest';
import {
  defenseBluf,
  fieldGoalBluf,
  passingBluf,
  puntBluf,
  rushingBluf,
  unit,
} from '../../src/lib/game/bluf';

describe('unit', () => {
  it('pluralises on the count', () => {
    expect(unit(1, 'TD')).toBe('1 TD');
    expect(unit(2, 'TD')).toBe('2 TDs');
    expect(unit(0, 'sack')).toBe('0 sacks');
    expect(unit(1, 'defensive TD')).toBe('1 defensive TD');
  });
});

describe('rushingBluf', () => {
  it('reports no attempts', () => {
    expect(rushingBluf({ attempts: 0 })).toBe('No rushing attempts.');
  });

  it('reports yards and touchdowns', () => {
    const bluf = rushingBluf({ attempts: 30, yards: 150, touchdowns: 2 });
    expect(bluf).toContain('150 rushing yards');
    expect(bluf).toContain('2 TDs');
  });

  it('reports negative yardage', () => {
    expect(rushingBluf({ attempts: 3, yards: -5 })).toContain('-5 rushing yards');
  });

  it('does not pluralise a single touchdown', () => {
    const bluf = rushingBluf({ attempts: 10, yards: 60, touchdowns: 1 });
    expect(bluf).toContain('1 TD');
    expect(bluf).not.toContain('TDs');
  });
});

describe('passingBluf', () => {
  it('reports no attempts', () => {
    expect(passingBluf({ attempts: 0 })).toBe('No passing attempts.');
  });

  it('reports yards and touchdowns', () => {
    const bluf = passingBluf({ attempts: 40, yards: 325, touchdowns: 3 });
    expect(bluf).toContain('325 passing yards');
    expect(bluf).toContain('3 TDs');
  });

  it('includes interceptions', () => {
    const bluf = passingBluf({ attempts: 20, yards: 120, interceptions: 2 });
    expect(bluf).toContain('120 passing yards');
    expect(bluf).toContain('2 INTs');
  });

  it('reports a zero-yard game that had attempts', () => {
    expect(passingBluf({ attempts: 5, yards: 0 })).toContain('0 passing yards');
  });
});

describe('defenseBluf', () => {
  it('reports nothing recorded', () => {
    expect(defenseBluf({})).toBe('No defensive stats recorded.');
  });

  it('leads with sacks and interceptions', () => {
    const bluf = defenseBluf({ total_tackles: 40, total_sacks: 3, total_interceptions: 2 });
    expect(bluf).toContain('3 sacks');
    expect(bluf).toContain('2 INTs');
  });

  it('leads with a defensive touchdown', () => {
    expect(defenseBluf({ total_tackles: 30, defensive_touchdowns: 1 })).toContain(
      '1 defensive TD',
    );
  });

  it('falls back to the tackle count', () => {
    expect(defenseBluf({ total_tackles: 45 })).toContain('45 total tackles');
  });
});

describe('fieldGoalBluf', () => {
  it('reports no attempts', () => {
    expect(fieldGoalBluf({ attempts: 0 })).toBe('No field goal attempts.');
  });

  it('reports a perfect day', () => {
    const bluf = fieldGoalBluf({ attempts: 3, made: 3, longest: 52, percentage: 100.0 });
    expect(bluf).toContain('3/3 on field goals');
    expect(bluf).toContain('longest 52 yards');
    expect(bluf).toContain('100.0%');
  });

  it('reports a mixed day', () => {
    const bluf = fieldGoalBluf({ attempts: 4, made: 2, longest: 40, percentage: 50.0 });
    expect(bluf).toContain('2/4 on field goals');
    expect(bluf).toContain('50.0%');
  });

  it('reports none made', () => {
    expect(fieldGoalBluf({ attempts: 2, made: 0, percentage: 0.0 })).toContain(
      '0/2 on field goals',
    );
  });
});

describe('puntBluf', () => {
  it('reports no punts', () => {
    expect(puntBluf({ punts: 0 })).toBe('No punts.');
  });

  it('reports the average and longest', () => {
    const bluf = puntBluf({ punts: 6, avg_yards: 45.0, longest: 58 });
    expect(bluf).toContain('6 punts, 45.0 avg');
    expect(bluf).toContain('longest 58');
  });

  it('formats a whole-number average to one decimal', () => {
    expect(puntBluf({ punts: 4, avg_yards: 37.0, longest: 44 })).toContain('4 punts, 37.0 avg');
  });

  // Matches the Python, which did not special-case a single punt.
  it('does not pluralise punts specially', () => {
    expect(puntBluf({ punts: 1, avg_yards: 42.0, longest: 42 })).toContain('1 punts, 42.0 avg');
  });
});
