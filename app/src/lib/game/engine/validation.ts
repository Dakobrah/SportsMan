/**
 * Validation primitives the play classes share.
 *
 * A leaf, moved out of validate.ts so each play can validate its own form
 * without the engine importing validate.ts back -- which would be a cycle,
 * since validate.ts now asks the engine which play it is looking at.
 */

export interface FieldRange {
  min: number;
  max: number;
  label: string;
}

/** Verbatim from tracker.py:59-72, keyed by the form field it guards. */
export const NUMERIC_FIELDS: Record<string, FieldRange> = {
  quarter: { min: 1, max: 9, label: 'Quarter' },
  down: { min: 1, max: 4, label: 'Down' },
  distance: { min: 0, max: 99, label: 'Distance' },
  ballPosition: { min: -50, max: 50, label: 'Ball position' },
  yardsGained: { min: -99, max: 99, label: 'Yards gained' },
  airYards: { min: -99, max: 99, label: 'Air yards' },
  sackYards: { min: -99, max: 0, label: 'Sack yards' },
  puntYards: { min: 0, max: 99, label: 'Punt yards' },
  kickYards: { min: 0, max: 120, label: 'Kick yards' },
  kickDistance: { min: 0, max: 80, label: 'Kick distance' },
  penaltyYards: { min: -99, max: 99, label: 'Penalty yards' },
  teamScore: { min: 0, max: 199, label: 'Score' },
  opponentScore: { min: 0, max: 199, label: 'Score' },
};

export class ValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(message: string, code: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.field = field;
  }
}

/** Check one numeric field against its declared range. */
export function checkNumber(field: string, value: unknown): void {
  const range = NUMERIC_FIELDS[field];
  if (!range) return;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${range.label} must be a number.`, 'not_a_number', field);
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${range.label} must be a whole number.`, 'not_an_integer', field);
  }
  if (value < range.min || value > range.max) {
    throw new ValidationError(
      `${range.label} must be between ${range.min} and ${range.max}.`,
      'out_of_range',
      field,
    );
  }
}

/**
 * Two flags that cannot both be true. `validateForm` wrote this five-line
 * throw out four times for the pass form alone.
 */
export function contradiction(message: string, field: string): never {
  throw new ValidationError(message, 'contradictory', field);
}
