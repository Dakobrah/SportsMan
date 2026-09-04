import { describe, expect, it } from 'vitest';
import {
  NUMERIC_FIELDS,
  ValidationError,
  checkNumber,
  validateCursor,
  validateForm,
  validateJerseys,
} from '../../src/lib/game/validate';
import { blankForm } from '../../src/lib/game/playForm';
import { OPENING_CURSOR } from '../../src/lib/game/cursor';

describe('numeric ranges', () => {
  it('accepts both ends of every declared range', () => {
    for (const [field, range] of Object.entries(NUMERIC_FIELDS)) {
      expect(() => checkNumber(field, range.min)).not.toThrow();
      expect(() => checkNumber(field, range.max)).not.toThrow();
    }
  });

  it('rejects just outside both ends of every declared range', () => {
    for (const [field, range] of Object.entries(NUMERIC_FIELDS)) {
      expect(() => checkNumber(field, range.min - 1)).toThrow(ValidationError);
      expect(() => checkNumber(field, range.max + 1)).toThrow(ValidationError);
    }
  });

  it('names the field and its label so the UI can highlight it', () => {
    try {
      checkNumber('ballPosition', 99);
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as ValidationError;
      expect(failure.field).toBe('ballPosition');
      expect(failure.code).toBe('out_of_range');
      expect(failure.message).toContain('Ball position');
      expect(failure.message).toContain('-50');
    }
  });

  it('rejects non-numbers and fractions', () => {
    expect(() => checkNumber('down', '2' as unknown)).toThrow(/must be a number/);
    expect(() => checkNumber('down', Number.NaN)).toThrow(/must be a number/);
    expect(() => checkNumber('yardsGained', 2.5)).toThrow(/whole number/);
  });

  it('ignores fields it has no rule for', () => {
    expect(() => checkNumber('notAField', 12345)).not.toThrow();
  });

  it('guards the ball position against the -50..+50 convention', () => {
    expect(() => checkNumber('ballPosition', -50)).not.toThrow();
    expect(() => checkNumber('ballPosition', 50)).not.toThrow();
    expect(() => checkNumber('ballPosition', 51)).toThrow();
  });

  it('only allows a sack to lose yards', () => {
    expect(() => checkNumber('sackYards', -7)).not.toThrow();
    expect(() => checkNumber('sackYards', 0)).not.toThrow();
    expect(() => checkNumber('sackYards', 1)).toThrow();
  });
});

describe('cursor validation', () => {
  it('accepts the opening cursor', () => {
    expect(() => validateCursor(OPENING_CURSOR)).not.toThrow();
  });

  it('accepts a dead ball with no down or distance', () => {
    expect(() =>
      validateCursor({ ...OPENING_CURSOR, down: null, distance: null, situation: 'kickoff' }),
    ).not.toThrow();
  });

  it('rejects an impossible down or quarter', () => {
    expect(() => validateCursor({ ...OPENING_CURSOR, down: 5 })).toThrow(/Down/);
    expect(() => validateCursor({ ...OPENING_CURSOR, quarter: 0 })).toThrow(/Quarter/);
  });
});

describe('form validation', () => {
  it('accepts every blank form', () => {
    const penalty = { ...blankForm('penalty'), penaltyName: 'False Start' };
    expect(() => validateForm(penalty)).not.toThrow();
    for (const type of ['run', 'pass', 'kickoff', 'punt', 'field_goal', 'extra_point'] as const) {
      expect(() => validateForm(blankForm(type))).not.toThrow();
    }
  });

  it('requires a penalty to be named', () => {
    expect(() => validateForm(blankForm('penalty'))).toThrow(/Pick a penalty/);
  });

  it('rejects contradictory pass outcomes', () => {
    const pass = blankForm('pass');
    expect(() => validateForm({ ...pass, wasSacked: true, isComplete: true })).toThrow(/sack/i);
    expect(() => validateForm({ ...pass, isInterception: true, isComplete: true })).toThrow(/interception/i);
    // A touchdown pass that was never completed is a mis-tap, not a play.
    expect(() => validateForm({ ...pass, isTouchdown: true, isComplete: false })).toThrow(/complete/i);
  });

  it('bounds yardage on the plays that carry it', () => {
    expect(() => validateForm({ ...blankForm('run'), yardsGained: 120 })).toThrow(/Yards gained/);
    expect(() => validateForm({ ...blankForm('punt'), puntYards: -1 })).toThrow(/Punt yards/);
    expect(() => validateForm({ ...blankForm('kickoff'), kickYards: 200 })).toThrow(/Kick yards/);
    expect(() => validateForm({ ...blankForm('field_goal'), kickDistance: 90 })).toThrow(/Kick distance/);
  });
});

describe('jersey validation', () => {
  it('accepts any number in range, on the roster or not', () => {
    // The opponent's offence is never on our roster, so an unknown number
    // has to be an ordinary answer rather than an error.
    for (const number of [0, 1, 22, 99]) {
      expect(() => validateJerseys({ ...blankForm('run'), ballCarrierNumber: number })).not.toThrow();
    }
  });

  it('accepts a play with nobody attached', () => {
    expect(() => validateJerseys(blankForm('run'))).not.toThrow();
    expect(() => validateJerseys(blankForm('pass'))).not.toThrow();
  });

  it('rejects a number outside 0-99 and says which field', () => {
    try {
      validateJerseys({ ...blankForm('pass'), quarterbackNumber: 7, receiverNumber: 100 });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as ValidationError;
      expect(failure.code).toBe('out_of_range');
      expect(failure.field).toBe('receiverNumber');
    }
    expect(() => validateJerseys({ ...blankForm('run'), ballCarrierNumber: -1 })).toThrow();
  });

  it('rejects a fractional number', () => {
    expect(() => validateJerseys({ ...blankForm('punt'), punterNumber: 2.5 })).toThrow(/whole number/);
  });

  it('checks every jersey field a form carries', () => {
    expect(() => validateJerseys({ ...blankForm('field_goal'), kickerNumber: 250 })).toThrow();
    expect(() => validateJerseys({ ...blankForm('kickoff'), kickerNumber: 250 })).toThrow();
    expect(() => validateJerseys({ ...blankForm('extra_point'), kickerNumber: 250 })).toThrow();
    // A penalty names nobody.
    expect(() => validateJerseys({ ...blankForm('penalty'), penaltyName: 'Clipping' })).not.toThrow();
  });
});
