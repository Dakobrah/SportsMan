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
 * Jersey numbers are checked for range only, not roster membership. The app
 * keeps one team's roster, but a game has two, and once possession is
 * tracked the opponent's plays get recorded too -- so an unknown number is
 * ordinary, not an error. The number is stored either way and the player
 * link is set only when it resolves; see toSnapRow.
 */
import type { GameCursor } from './cursor';
import { JERSEY_MAX, JERSEY_MIN, type PlayForm } from './playForm';

import type { JerseyField } from './engine/PlayDefinition';
import { plays } from './engine/PlayRegistry';
import { checkNumber, ValidationError } from './engine/validation';

export {
  checkNumber, contradiction, NUMERIC_FIELDS, ValidationError, type FieldRange,
} from './engine/validation';

export function validateCursor(cursor: GameCursor): void {
  checkNumber('quarter', cursor.quarter);
  checkNumber('ballPosition', cursor.ballPosition);
  if (cursor.down !== null) checkNumber('down', cursor.down);
  if (cursor.distance !== null) checkNumber('distance', cursor.distance);
}

/** Throws a `ValidationError` naming the field to fix. Each play checks its own form. */
export function validateForm(form: PlayForm): void {
  plays.forForm(form).validate(form);
}

/** Which form fields hold a jersey number. */
export function jerseyFields(form: PlayForm): JerseyField[] {
  return plays.forForm(form).jerseyFields(form);
}

/**
 * Jersey numbers must be whole and in range. Deliberately NOT checked
 * against the roster: an unrostered number is how the opponent's offence
 * gets recorded at all.
 */
export function validateJerseys(form: PlayForm): void {
  for (const [field, number] of jerseyFields(form)) {
    if (number === null) continue;
    if (!Number.isInteger(number)) {
      throw new ValidationError('Jersey number must be a whole number.', 'not_an_integer', field);
    }
    if (number < JERSEY_MIN || number > JERSEY_MAX) {
      throw new ValidationError(
        `Jersey number must be between ${JERSEY_MIN} and ${JERSEY_MAX}.`,
        'out_of_range',
        field,
      );
    }
  }
}
