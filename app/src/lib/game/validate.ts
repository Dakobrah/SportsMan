/**
 * Play validation.
 *
 * Ported from `_clean_payload`, `_NUMERIC_FIELDS` and `_validate_players` in
 * apps/frontend/tracker.py. Those ran on the server because the client could
 * not be trusted; here there is no server, and the reason to keep them is
 * different but just as real — a coach mis-tapping a number on a tablet in
 * the rain should get a legible message pointing at the field, not a CHECK
 * constraint failure.
 *
 * `validatePlayers` takes the roster as data rather than querying, so the
 * whole module stays pure and the tracker's already-loaded roster is reused.
 */
import type { Player } from '../db/repositories/types';
import type { GameCursor } from './cursor';
import type { PlayForm } from './playForm';

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

export function validateCursor(cursor: GameCursor): void {
  checkNumber('quarter', cursor.quarter);
  checkNumber('ballPosition', cursor.ballPosition);
  if (cursor.down !== null) checkNumber('down', cursor.down);
  if (cursor.distance !== null) checkNumber('distance', cursor.distance);
}

export function validateForm(form: PlayForm): void {
  switch (form.type) {
    case 'run':
      checkNumber('yardsGained', form.yardsGained);
      break;
    case 'pass':
      checkNumber('yardsGained', form.yardsGained);
      if (form.wasSacked && form.isComplete) {
        throw new ValidationError(
          'A sack cannot also be a completion.',
          'contradictory',
          'isComplete',
        );
      }
      if (form.isInterception && form.isComplete) {
        throw new ValidationError(
          'An interception cannot also be a completion.',
          'contradictory',
          'isInterception',
        );
      }
      if (form.isTouchdown && !form.isComplete) {
        throw new ValidationError(
          'A touchdown pass has to be complete.',
          'contradictory',
          'isTouchdown',
        );
      }
      break;
    case 'penalty':
      checkNumber('penaltyYards', form.penaltyYards);
      if (!form.penaltyName.trim()) {
        throw new ValidationError('Pick a penalty.', 'required', 'penaltyName');
      }
      break;
    case 'kickoff':
      checkNumber('kickYards', form.kickYards);
      break;
    case 'punt':
      checkNumber('puntYards', form.puntYards);
      break;
    case 'field_goal':
      checkNumber('kickDistance', form.kickDistance);
      break;
    case 'extra_point':
      break;
    default: {
      const exhaustive: never = form;
      throw new Error(`unknown play form: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Which form fields name a player, per kind. */
function playerFields(form: PlayForm): [string, number | null][] {
  switch (form.type) {
    case 'run':
      return [['ballCarrierId', form.ballCarrierId]];
    case 'pass':
      return [
        ['quarterbackId', form.quarterbackId],
        ['receiverId', form.receiverId],
      ];
    case 'kickoff':
      return [['kickerId', form.kickerId]];
    case 'punt':
      return [['punterId', form.punterId]];
    case 'field_goal':
      return [['kickerId', form.kickerId]];
    case 'extra_point':
      return [['kickerId', form.kickerId]];
    case 'penalty':
      return [];
  }
}

/**
 * Every player named on the play must be on this game's roster. Django
 * re-queried the database for this on every play; the tracker already holds
 * the roster, so it is a set lookup.
 */
export function validatePlayers(form: PlayForm, roster: Player[]): void {
  const onRoster = new Set(roster.map((player) => player.id));
  for (const [field, id] of playerFields(form)) {
    if (id !== null && !onRoster.has(id)) {
      throw new ValidationError(
        'That player is not on this game’s roster.',
        'unknown_player',
        field,
      );
    }
  }
}
