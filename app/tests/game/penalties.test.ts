import { describe, expect, it } from 'vitest';
import { PENALTIES, findPenalty } from '../../src/lib/game/penalties';

describe('penalty catalogue', () => {
  it('carries all 27 penalties from the Django tracker', () => {
    expect(PENALTIES).toHaveLength(27);
  });

  it('has no duplicate names', () => {
    expect(new Set(PENALTIES.map((p) => p.name)).size).toBe(PENALTIES.length);
  });

  it('finds a penalty by name and misses cleanly', () => {
    expect(findPenalty('False Start')).toMatchObject({ yards: 5, onOffense: true });
    expect(findPenalty('Excessive Celebration')).toBeUndefined();
  });

  it('keeps the enforcement details that drive the form', () => {
    expect(findPenalty('Holding (Defense)')).toMatchObject({
      yards: 5, onOffense: false, autoFirstDown: true,
    });
    // Spot fouls carry no fixed yardage -- the coach enters the spot.
    expect(findPenalty('Pass Interference (Def)')).toMatchObject({
      yards: 0, spotFoul: true, autoFirstDown: true,
    });
    expect(findPenalty('Intentional Grounding')).toMatchObject({
      yards: 0, onOffense: true, lossOfDown: true,
    });
  });

  it('only ever uses real enforcement distances', () => {
    for (const penalty of PENALTIES) {
      expect([0, 5, 10, 15]).toContain(penalty.yards);
    }
  });

  it('never marks a penalty both auto-first-down and on offense', () => {
    // An offensive foul cannot hand the offense a first down.
    for (const penalty of PENALTIES) {
      if (penalty.autoFirstDown) expect(penalty.onOffense).toBe(false);
    }
  });
});
