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

    it('sends a defensive touchdown to the extra point from our side', () => {
      const result = computeNextState(
        { down: 3, distance: 2, ballPosition: -10, possession: 'them' },
        'pass',
        {},
        { isDefensiveTouchdown: true },
      );
      expect(result.situation).toBe('extra_point');
      expect(result.down).toBeNull();
      expect(result.distance).toBeNull();
      // Our defense scored, so the PAT is from our own 3.
      expect(result.ballPosition).toBe(EXTRA_POINT_SPOT);
      expect(result.possession).toBe('us');
    });

    it('hands the ball over on the spot after an interception', () => {
      const result = computeNextState(
        { down: 2, distance: 7, ballPosition: -30, possession: 'us' },
        'pass',
        {},
        { isInterception: true, yardsGained: 0 },
      );
      expect(result.situation).toBe('turnover');
      expect(result.down).toBe(1);
      expect(result.distance).toBe(10);
      // The ball does not move. Django mirrored it to +30, so on screen it
      // jumped the width of the field.
      expect(result.ballPosition).toBe(-30);
      expect(result.possession).toBe('them');
    });

    it('hands the ball over where a lost fumble ended', () => {
      const result = computeNextState(
        { down: 3, distance: 4, ballPosition: -20, possession: 'us' },
        'run',
        {},
        { fumbleLost: true, yardsGained: 2 },
      );
      expect(result.situation).toBe('turnover');
      // Fumbled forward two yards to our own 32; they take over there.
      expect(result.ballPosition).toBe(-18);
      expect(result.possession).toBe('them');
    });
  });

  describe('special teams', () => {
    it('gives the receiving team their own 25 on a kickoff', () => {
      const result = computeNextState(
        { down: null, distance: null, ballPosition: -15, possession: 'us' },
        'kickoff',
      );
      expect(result.situation).toBe('normal');
      // We kicked, so they receive on THEIR 25, which is +25 here. Django
      // returned -25, our own 25, wherever the kick came from.
      expect(result.ballPosition).toBe(25);
      expect(result.possession).toBe('them');
    });

    it('gives us their kickoff at our own 25', () => {
      const result = computeNextState(
        { down: null, distance: null, ballPosition: 15, possession: 'them' },
        'kickoff',
      );
      expect(result.ballPosition).toBe(KICKOFF_TOUCHBACK_SPOT);
      expect(result.possession).toBe('us');
    });

    it('fields a kickoff where it lands and runs it back', () => {
      // We kick 60 from our own 35, so it comes down on their 5; a 20-yard
      // return puts them on their 25 -- the same answer the flat default
      // gives, which is why that default was a reasonable approximation.
      const result = computeNextState(
        { down: null, distance: null, ballPosition: -15, possession: 'us' },
        'kickoff',
        { kickYards: 60, returnYards: 20 },
      );
      expect(result.ballPosition).toBe(25);
      expect(result.possession).toBe('them');

      // A longer return goes further, which the flat default could not express.
      const long = computeNextState(
        { down: null, distance: null, ballPosition: -15, possession: 'us' },
        'kickoff',
        { kickYards: 60, returnYards: 45 },
      );
      expect(long.ballPosition).toBe(0);
    });

    it('keeps possession with the kicking team on a muffed kick', () => {
      // The one lost fumble that does not change hands: the ball was already
      // travelling to the other team, so their muff gives it back to us.
      const result = computeNextState(
        { down: null, distance: null, ballPosition: -15, possession: 'us' },
        'kickoff',
        { kickYards: 60 },
        { fumbleLost: true },
      );
      expect(result.possession).toBe('us');
      expect(result.situation).toBe('turnover');
      expect(result.ballPosition).toBe(45);
    });

    it('keeps possession with the punting team on a muffed punt', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35, possession: 'us' },
        'punt',
        { puntYards: 45 },
        { fumbleLost: true },
      );
      expect(result.possession).toBe('us');
      expect(result.ballPosition).toBe(10);
    });

    it('treats a fair catch as a return of zero', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35, possession: 'us' },
        'punt',
        { puntYards: 45, returnYards: 30, isFairCatch: true },
      );
      // Fielded on their 40 and stopped there, the 30 ignored.
      expect(result.ballPosition).toBe(10);
      expect(result.possession).toBe('them');
    });

    it('runs a punt back toward the punting team', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35, possession: 'us' },
        'punt',
        { puntYards: 45, returnYards: 12 },
      );
      // Fielded on their 40, returned 12 back toward our end zone.
      expect(result.ballPosition).toBe(-2);
      expect(result.possession).toBe('them');
    });

    it('leaves a punt where it landed and changes possession', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35, possession: 'us' },
        'punt',
        { puntYards: 45 },
      );
      expect(result.situation).toBe('opponent_ball');
      // 45 yards downfield from our own 15 is their 40. Django mirrored it.
      expect(result.ballPosition).toBe(10);
      expect(result.possession).toBe('them');
      expect(result.distance).toBe(10);
    });

    it('gives the receiving team their 20 on a punt touchback', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: -35 },
        'punt',
        { puntYards: 55, isTouchback: true },
      );
      // A punt touchback is the RECEIVING team's own 20. We punted, so that
      // is their 20 at +30. Django returned -20, our own 30.
      expect(result.ballPosition).toBe(30);
      expect(result.possession).toBe('them');
    });

    it('gives us our own 20 on their punt touchback', () => {
      const result = computeNextState(
        { down: 4, distance: 8, ballPosition: 35, possession: 'them' },
        'punt',
        { puntYards: 55, isTouchback: true },
      );
      expect(result.ballPosition).toBe(PUNT_TOUCHBACK_SPOT);
      expect(result.possession).toBe('us');
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
        { down: 4, distance: 3, ballPosition: 15, possession: 'us' },
        'field_goal',
        { result: 'MISS' },
      );
      expect(result.situation).toBe('opponent_ball');
      // They take over where the kick was attempted. Django mirrored it.
      expect(result.ballPosition).toBe(15);
      expect(result.possession).toBe('them');
      expect(result.distance).toBe(10);
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

  describe('touchdown from opponent territory', () => {
    it('us: TD at opp 45, PAT good, we punt from our side', () => {
      // 1. Touchdown: us scores from the opponent's 45.
      const afterTD = computeNextState(
        { down: 1, distance: 10, ballPosition: 45, possession: 'us' },
        'run',
        {},
        { isTouchdown: true },
      );
      expect(afterTD.situation).toBe('extra_point');
      expect(afterTD.possession).toBe('us');
      expect(afterTD.ballPosition).toBe(EXTRA_POINT_SPOT);

      // 2. PAT good: transitions to kickoff.
      const afterPAT = computeNextState(
        { down: null, distance: null, ballPosition: EXTRA_POINT_SPOT, possession: 'us' },
        'extra_point',
        { result: 'GOOD' },
      );
      expect(afterPAT.situation).toBe('kickoff');
      expect(afterPAT.possession).toBe('us');

      // 3. Punt by us from our side: changes possession to them.
      const afterPunt = computeNextState(
        { down: 4, distance: 8, ballPosition: -35, possession: 'us' },
        'punt',
        { puntYards: 45 },
      );
      expect(afterPunt.possession).toBe('them');
    });

    it('us: TD at opp 45, PAT good, they punt back', () => {
      // 1. Touchdown: us scores from the opponent's 45.
      const afterTD = computeNextState(
        { down: 1, distance: 10, ballPosition: 45, possession: 'us' },
        'run',
        {},
        { isTouchdown: true },
      );
      expect(afterTD.situation).toBe('extra_point');
      expect(afterTD.possession).toBe('us');

      // 2. PAT good: transitions to kickoff.
      const afterPAT = computeNextState(
        { down: null, distance: null, ballPosition: EXTRA_POINT_SPOT, possession: 'us' },
        'extra_point',
        { result: 'GOOD' },
      );
      expect(afterPAT.situation).toBe('kickoff');

      // 3. Punt by them from their side: changes possession to us.
      const afterPunt = computeNextState(
        { down: 4, distance: 8, ballPosition: 35, possession: 'them' },
        'punt',
        { puntYards: 45 },
      );
      expect(afterPunt.possession).toBe('us');
    });

    it('them: TD at our 45, we attempt PAT (def TD), then we punt from our side', () => {
      // 1. Defensive touchdown: they have the ball at our 45, we intercept and return for TD.
      const afterTD = computeNextState(
        { down: 3, distance: 2, ballPosition: -45, possession: 'them' },
        'pass',
        {},
        { isDefensiveTouchdown: true },
      );
      expect(afterTD.situation).toBe('extra_point');
      // Our defense scored, so we attempt the PAT.
      expect(afterTD.possession).toBe('us');
      expect(afterTD.ballPosition).toBe(EXTRA_POINT_SPOT);

      // 2. PAT good: transitions to kickoff.
      const afterPAT = computeNextState(
        { down: null, distance: null, ballPosition: EXTRA_POINT_SPOT, possession: 'us' },
        'extra_point',
        { result: 'GOOD' },
      );
      expect(afterPAT.situation).toBe('kickoff');
      expect(afterPAT.possession).toBe('us');

      // 3. Punt by us from our side: changes possession to them.
      const afterPunt = computeNextState(
        { down: 4, distance: 8, ballPosition: -35, possession: 'us' },
        'punt',
        { puntYards: 45 },
      );
      expect(afterPunt.possession).toBe('them');
    });

    it('them: TD at our 45, we make PAT, then they punt', () => {
      // 1. Defensive touchdown: they have the ball at our 45, we intercept and return for TD.
      const afterTD = computeNextState(
        { down: 3, distance: 2, ballPosition: -45, possession: 'them' },
        'pass',
        {},
        { isDefensiveTouchdown: true },
      );
      expect(afterTD.situation).toBe('extra_point');
      expect(afterTD.possession).toBe('us');

      // 2. PAT good: transitions to kickoff.
      const afterPAT = computeNextState(
        { down: null, distance: null, ballPosition: EXTRA_POINT_SPOT, possession: 'us' },
        'extra_point',
        { result: 'GOOD' },
      );
      expect(afterPAT.situation).toBe('kickoff');

      // 3. Punt by them from their side: changes possession to us.
      const afterPunt = computeNextState(
        { down: 4, distance: 8, ballPosition: 35, possession: 'them' },
        'punt',
        { puntYards: 45 },
      );
      expect(afterPunt.possession).toBe('us');
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

    it('turns the ball over on downs where the ball stopped', () => {
      const result = computeNextState(
        { down: 4, distance: 3, ballPosition: -25, possession: 'us' },
        'run',
        {},
        { yardsGained: 1 },
      );
      expect(result.situation).toBe('turnover_on_downs');
      // Stopped a yard short at our own 26; they take over right there.
      expect(result.ballPosition).toBe(-24);
      expect(result.possession).toBe('them');
      expect(result.distance).toBe(10);
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
