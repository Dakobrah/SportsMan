/**
 * Points a play puts on our scoreboard.
 *
 * Django implemented this four times over (tracker_add_run:454,
 * tracker_add_pass:537, tracker_add_field_goal:831,
 * tracker_add_extra_point:898) and its inverse a fifth time in
 * tracker_undo_play:1001-1015. One rule in one place here, in two
 * directions: `pointsFor` reads a form on the way in, `pointsForSnap` reads
 * a stored row on the way back out. A test asserts the two agree for every
 * form, so they cannot drift.
 */
import type { Snap } from '../db/repositories/types';
import type { PlayForm } from './playForm';

const TOUCHDOWN = 6;
const FIELD_GOAL = 3;
const PAT_KICK = 1;
const TWO_POINT = 2;

export function pointsFor(form: PlayForm): number {
  switch (form.type) {
    case 'run':
    case 'pass':
      return form.isTouchdown ? TOUCHDOWN : 0;
    case 'field_goal':
      return form.result === 'GOOD' ? FIELD_GOAL : 0;
    case 'extra_point':
      if (form.result !== 'GOOD') return 0;
      return form.attemptType === 'KICK' ? PAT_KICK : TWO_POINT;
    case 'penalty':
    case 'kickoff':
    case 'punt':
      return 0;
  }
}

/**
 * The same rules read off a stored snap — the undo direction.
 *
 * Anything other than GOOD scores nothing. That matters: the schema's
 * `result` CHECK also admits 'FAIL' (Django's ExtraPointSnap.Result.FAILED),
 * which its undo never considered.
 */
export function pointsForSnap(snap: Snap): number {
  switch (snap.kind) {
    case 'RUN':
    case 'PASS':
      return snap.isTouchdown ? TOUCHDOWN : 0;
    case 'FG':
      return snap.result === 'GOOD' ? FIELD_GOAL : 0;
    case 'XP':
      if (snap.result !== 'GOOD') return 0;
      return snap.attemptType === 'KICK' ? PAT_KICK : TWO_POINT;
    default:
      return 0;
  }
}
