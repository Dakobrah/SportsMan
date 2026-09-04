/**
 * Ported from tests/unit/test_compute_next_state.py.
 *
 * Cases marked FIXED assert corrected behaviour rather than what the Python
 * did. Each one is a coordinate bug the Python tests had frozen in place —
 * see the notes on nextState.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  EXTRA_POINT_SPOT,
  KICKOFF_SPOT,
  KICKOFF_TOUCHBACK_SPOT,
  OPPONENT_GOAL,
  PUNT_TOUCHBACK_SPOT,
  opponentYardLine,
} from '../../src/lib/game/field';
import { computeNextState } from '../../src/lib/game/nextState';

describe('computeNextState', () => {
  describe('scoring and turnovers', () => {
    it('sends a touchdown to the extra point', () => {
      const result = computeNextState(
        { down: 2, distance: 5, ballPosition: 45 },
        'run',
        {},
        { isTouchdown: true },
      );
      expect(result.situation).toBe('extra_point');
      expect(result.down).toBeNull();
      expect(result.distance).toBeNull();
      // FIXED: Python returned 35, which is the opponent's 15 under this
      // convention. A PAT is snapped from the opponent's 3.
      expect(result.ballPosition).toBe(EXTRA_POINT_SPOT);
    });

    it('flips the field on an interception', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: -30 },
        'pass',
        {},
        { isInterception: true, yardsGained: 0 },
      );
      expect(result.situation).toBe('turnover');
      expect(result.down).toBe(1);
      expect(result.distance).toBe(10);
      expect(result.ballPosition).toBe(30);
    });

    it('flips the field on a lost fumble', () => {
      const result = computeNextState(
        { down: 3, distance: 4, ballPosition: -20 },
        'run',
        {},
        { fumbleLost: true, yardsGained: 2 },
      );
      expect(result.situation).toBe('turnover');
      expect(result.ballPosition).toBe(18);
    });
  });

  describe('special teams', () => {
    it('gives the receiving team their 25 on a kickoff', () => {
      const result = computeNextState({ down: null, distance: null, ballPosition: -15 }, 'kickoff');
      expect(result.situation).toBe('normal');
      expect(result.ballPosition).toBe(KICKOFF_TOUCHBACK_SPOT);
    });

    it('flips the field on a returned punt', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35 },
        'punt',
        { puntYards: 45 },
      );
      expect(result.situation).toBe('opponent_ball');
      expect(result.ballPosition).toBe(-10);
    });

    it('gives the receiving team their 20 on a punt touchback', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35 },
        'punt',
        { puntYards: 55, isTouchback: true },
      );
      // FIXED: Python returned -20, which is our own 30 under this
      // convention. A punt touchback is the receiving team's own 20.
      expect(result.ballPosition).toBe(PUNT_TOUCHBACK_SPOT);
    });

    it('sends a good field goal to the kickoff', () => {
      const result = computeNextState(
        { down: 4, distance: 3, ballPosition: 15 },
        'field_goal',
        { result: 'GOOD' },
      );
      expect(result.situation).toBe('kickoff');
      expect(result.down).toBeNull();
      // FIXED: Python returned 35 (the opponent's 15). A kickoff is from our 35.
      expect(result.ballPosition).toBe(KICKOFF_SPOT);
    });

    it('gives a missed field goal to the opponent at the spot', () => {
      const result = computeNextState(
        { down: 4, distance: 3, ballPosition: 15 },
        'field_goal',
        { result: 'MISS' },
      );
      expect(result.situation).toBe('opponent_ball');
      expect(result.ballPosition).toBe(-15);
    });

    it('sends an extra point to the kickoff', () => {
      const result = computeNextState(
        { down: null, distance: null, ballPosition: EXTRA_POINT_SPOT },
        'extra_point',
        { result: 'GOOD' },
      );
      expect(result.situation).toBe('kickoff');
      expect(result.ballPosition).toBe(KICKOFF_SPOT);
    });
  });

  describe('penalties', () => {
    it('moves us back and lengthens the distance', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: -30 },
        'penalty',
        { penaltyYards: 10, onOffense: true, accepted: true },
      );
      expect(result).toMatchObject({
        down: 2,
        distance: 17,
        ballPosition: -40,
        situation: 'normal',
      });
    });

    it('advances the down when declined', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: -30 },
        'penalty',
        { penaltyYards: 10, onOffense: true, accepted: false },
      );
      expect(result).toMatchObject({ down: 3, distance: 7, ballPosition: -30 });
    });

    it('resets the downs on an automatic first down', () => {
      const result = computeNextState(
        { down: 3, distance: 8, ballPosition: -40 },
        'penalty',
        { penaltyYards: 12, onOffense: false, accepted: true, autoFirstDown: true },
      );
      expect(result).toMatchObject({ down: 1, distance: 10, ballPosition: -28 });
    });

    it('keeps the down when the penalty repeats it', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: -30 },
        'penalty',
        { penaltyYards: 5, onOffense: true, accepted: true, repeatDown: true },
      );
      expect(result).toMatchObject({ down: 2, distance: 12, ballPosition: -35 });
    });

    it('resets the downs when a defensive penalty covers the distance', () => {
      const result = computeNextState(
        { down: 3, distance: 4, ballPosition: -30 },
        'penalty',
        { penaltyYards: 5, onOffense: false, accepted: true },
      );
      expect(result).toMatchObject({ down: 1, distance: 10, ballPosition: -25 });
    });
  });

  describe('plays from scrimmage', () => {
    it('resets the downs on a first down', () => {
      const result = computeNextState(
        { down: 2, distance: 3, ballPosition: -25 },
        'run',
        {},
        { yardsGained: 8, isFirstDown: true },
      );
      expect(result).toMatchObject({ down: 1, distance: 10, ballPosition: -17 });
    });

    it('resets the downs when the yardage alone covers the distance', () => {
      const result = computeNextState(
        { down: 3, distance: 5, ballPosition: -40 },
        'pass',
        {},
        { yardsGained: 12 },
      );
      expect(result).toMatchObject({ down: 1, distance: 10, ballPosition: -28 });
    });

    it('advances the down and shortens the distance otherwise', () => {
      const result = computeNextState(
        { down: 1, distance: 10, ballPosition: -25 },
        'run',
        {},
        { yardsGained: 4 },
      );
      expect(result).toMatchObject({ down: 2, distance: 6, ballPosition: -21 });
    });

    it('turns the ball over on downs after fourth', () => {
      const result = computeNextState(
        { down: 4, distance: 3, ballPosition: -25 },
        'run',
        {},
        { yardsGained: 1 },
      );
      expect(result.situation).toBe('turnover_on_downs');
      expect(result.ballPosition).toBe(24);
    });

    it('never reports a distance below one yard', () => {
      const result = computeNextState(
        { down: 1, distance: 10, ballPosition: -25 },
        'run',
        {},
        { yardsGained: 9 },
      );
      expect(result.distance).toBe(1);
    });
  });

  describe('goal to go', () => {
    // Inside the opponent's 10 there are fewer than ten yards to gain. Found
    // by replaying a real game: a 41-yard completion to the opponent's 7 was
    // reported as "1st & 10".
    it('caps the distance at the goal line on a first down', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: 2 },
        'pass',
        {},
        { yardsGained: 41, isFirstDown: true },
      );
      expect(result.ballPosition).toBe(opponentYardLine(7));
      expect(result.distance).toBe(7);
    });

    it('still gives ten yards outside the ten', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: 0 },
        'run',
        {},
        { yardsGained: 20, isFirstDown: true },
      );
      expect(result.distance).toBe(10);
    });

    it('caps the distance on later downs too', () => {
      // 1st & goal from the 8, gain 3 -> 2nd & goal from the 5.
      const result = computeNextState(
        { down: 1, distance: 8, ballPosition: opponentYardLine(8) },
        'run',
        {},
        { yardsGained: 3 },
      );
      expect(result).toMatchObject({ down: 2, distance: 5, ballPosition: opponentYardLine(5) });
    });

    it('caps the distance after a defensive penalty near the goal line', () => {
      const result = computeNextState(
        { down: 1, distance: 10, ballPosition: opponentYardLine(14) },
        'penalty',
        { penaltyYards: 5, onOffense: false, accepted: true },
      );
      expect(result.ballPosition).toBe(opponentYardLine(9));
      expect(result.distance).toBeLessThanOrEqual(9);
    });
  });

  describe('field boundaries', () => {
    it('clamps a loss at our own goal line', () => {
      const result = computeNextState(
        { down: 1, distance: 10, ballPosition: -49 },
        'run',
        {},
        { yardsGained: -2 },
      );
      expect(result.ballPosition).toBe(-50);
    });

    it('clamps a gain at the opponent goal line', () => {
      // FIXED: the Python first-down path did not clamp and returned 51 --
      // a position past the goal line, which its own test asserted.
      const result = computeNextState(
        { down: 1, distance: 10, ballPosition: 49 },
        'run',
        {},
        { yardsGained: 2, isFirstDown: true },
      );
      expect(result.ballPosition).toBe(OPPONENT_GOAL);
    });

    it('leaves in-bounds positions alone', () => {
      const result = computeNextState(
        { down: 1, distance: 10, ballPosition: -48 },
        'run',
        {},
        { yardsGained: 2 },
      );
      expect(result.ballPosition).toBe(-46);
    });
  });
});
