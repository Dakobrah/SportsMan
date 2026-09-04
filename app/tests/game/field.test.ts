import { describe, expect, it } from 'vitest';
import * as field from '../../src/lib/game/field';

describe('field position', () => {
  it('places our own yard lines in the negative half', () => {
    expect(field.ownYardLine(0)).toBe(field.OWN_GOAL);
    expect(field.ownYardLine(25)).toBe(-25);
    expect(field.ownYardLine(50)).toBe(field.MIDFIELD);
  });

  it('places the opponent yard lines in the positive half', () => {
    expect(field.opponentYardLine(0)).toBe(field.OPPONENT_GOAL);
    expect(field.opponentYardLine(20)).toBe(30);
    expect(field.opponentYardLine(50)).toBe(field.MIDFIELD);
  });

  it('names the spots consistently with the convention', () => {
    expect(field.KICKOFF_SPOT).toBe(-15); // our 35
    expect(field.KICKOFF_TOUCHBACK_SPOT).toBe(-25); // their 25
    expect(field.PUNT_TOUCHBACK_SPOT).toBe(-30); // their 20
    expect(field.EXTRA_POINT_SPOT).toBe(47); // opponent's 3
  });

  it('clamps to the field', () => {
    expect(field.clamp(-51)).toBe(field.OWN_GOAL);
    expect(field.clamp(51)).toBe(field.OPPONENT_GOAL);
    expect(field.clamp(12)).toBe(12);
  });

  it('measures distance to the goal line', () => {
    expect(field.yardsToGoal(field.OWN_GOAL)).toBe(100);
    expect(field.yardsToGoal(field.MIDFIELD)).toBe(50);
    expect(field.yardsToGoal(field.OPPONENT_GOAL)).toBe(0);
  });

  it('flips a position onto the other team', () => {
    // Our +30 is their 20, which from their side is -30.
    expect(field.flip(30)).toBe(-30);
    expect(field.flip(field.MIDFIELD)).toBe(field.MIDFIELD);
  });

  it('identifies scoring territory', () => {
    expect(field.isRedZone(field.opponentYardLine(20))).toBe(true);
    expect(field.isRedZone(field.opponentYardLine(21))).toBe(false);
    expect(field.isGoalToGo(field.opponentYardLine(10))).toBe(true);
    expect(field.isGoalToGo(field.opponentYardLine(11))).toBe(false);
  });

  // Matches _ball_pos_display in the Django tracker exactly.
  it('formats for the scoreboard', () => {
    expect(field.toDisplay(null)).toBe('—');
    expect(field.toDisplay(0)).toBe('50');
    expect(field.toDisplay(-25)).toBe('OWN 25');
    expect(field.toDisplay(-50)).toBe('OWN 0');
    expect(field.toDisplay(10)).toBe('OPP 40');
    expect(field.toDisplay(50)).toBe('OPP 0');
  });
});

describe('rendering geometry', () => {
  it('puts the goal lines at the inside edge of each end zone', () => {
    // The end zones sit outside the playing surface, not on top of it: our
    // goal line is the boundary, not the 10-yard line.
    expect(field.fieldPercent(field.OWN_GOAL)).toBeCloseTo(field.END_ZONE_PCT, 6);
    expect(field.fieldPercent(field.OPPONENT_GOAL)).toBeCloseTo(100 - field.END_ZONE_PCT, 6);
  });

  it('reserves ten of a hundred and twenty yards for each end zone', () => {
    expect(field.END_ZONE_PCT).toBeCloseTo(100 / 12, 6);
    expect(
      field.fieldPercent(field.OPPONENT_GOAL) - field.fieldPercent(field.OWN_GOAL),
    ).toBeCloseTo(100 * (100 / 120), 6);
  });

  it('puts midfield in the middle', () => {
    expect(field.fieldPercent(field.MIDFIELD)).toBeCloseTo(50, 6);
  });

  it('spaces yard lines evenly along the playing surface', () => {
    const fromOurGoal = field.fieldPercent(-30) - field.fieldPercent(field.OWN_GOAL);
    const fromTheirGoal = field.fieldPercent(field.OPPONENT_GOAL) - field.fieldPercent(30);
    expect(fromOurGoal).toBeCloseTo(fromTheirGoal, 6);
  });

  it('mirrors the whole field when ends are swapped', () => {
    for (const position of [field.OWN_GOAL, -25, field.MIDFIELD, 25, field.OPPONENT_GOAL]) {
      expect(field.fieldPercent(position, true)).toBeCloseTo(
        100 - field.fieldPercent(position),
        6,
      );
    }
  });
});

describe('hash marks', () => {
  it('sits 70 feet 9 inches from each sideline, as the NFL specifies', () => {
    expect(field.HASH_FROM_SIDELINE_FEET).toBeCloseTo(70.75, 6);
    expect(field.FIELD_WIDTH_FEET).toBe(160);
    expect(field.HASH_PCT).toBeCloseTo(44.21875, 6);
  });

  it('places the two rows 18 feet 6 inches apart, the width of the posts', () => {
    const apartPct = 100 - field.HASH_PCT * 2;
    const apartFeet = (apartPct / 100) * field.FIELD_WIDTH_FEET;
    expect(apartFeet).toBeCloseTo(18.5, 6);
  });

  it('is symmetrical about the middle of the field', () => {
    expect(field.HASH_PCT).toBeLessThan(50);
    expect(100 - field.HASH_PCT).toBeCloseTo(100 - field.HASH_PCT, 6);
    expect((field.HASH_PCT + (100 - field.HASH_PCT)) / 2).toBeCloseTo(50, 6);
  });
});
