/**
 * Points a play puts on the scoreboard.
 *
 * Django implemented this four times over (tracker_add_run:454,
 * tracker_add_pass:537, tracker_add_field_goal:831,
 * tracker_add_extra_point:898) and its inverse a fifth time in
 * tracker_undo_play:1001-1015. The rule now lives once, on each play
 * class's `points()`. A form reduces to the same facts a stored row does, so
 * the way in (`pointsFor`) and the way back out (`pointsForSnap`) are the
 * same code and cannot drift.
 *
 * Anything other than GOOD scores nothing. That matters: the schema's
 * `result` CHECK also admits 'FAIL' (Django's ExtraPointSnap.Result.FAILED),
 * which its undo never considered.
 */
import { plays } from './engine/PlayRegistry';
import type { ScoringFacts } from './engine/types';
import type { PlayForm } from './playForm';

export type { ScoringFacts };

/** Points `form` scores if saved. */
export const pointsFor = (form: PlayForm): number => plays.forForm(form).pointsFor(form);

/** Points a stored row scored -- the undo direction. */
export const pointsForSnap = (snap: ScoringFacts): number =>
  plays.findKind(snap.kind)?.points(snap) ?? 0;
