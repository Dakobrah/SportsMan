/**
 * Plain types the engine passes between its classes.
 *
 * A leaf: nothing here imports from the engine, so every class can depend on
 * it without a cycle.
 */
import type { Snap } from '../../db/repositories/types';
import type { PlayFormType } from '../playForm';

/**
 * The play types a form can record. Was declared twice, identically, as
 * `PlayType` in nextState.ts and `PlayFormType` in playForm.ts.
 */
export type PlayType = PlayFormType;

/** Kick and penalty details a play carries, as the state machine reads them. */
export interface PlayData {
  puntYards?: number;
  kickYards?: number;
  /** Yards the return advanced the ball, from where it was fielded. */
  returnYards?: number;
  isFairCatch?: boolean;
  isTouchback?: boolean;
  isOnsideKick?: boolean;
  result?: string;
  penaltyYards?: number;
  onOffense?: boolean;
  accepted?: boolean;
  autoFirstDown?: boolean;
  repeatDown?: boolean;
}

/** What actually happened on the play. */
export interface PlayResult {
  yardsGained?: number;
  isTouchdown?: boolean;
  isDefensiveTouchdown?: boolean;
  isFirstDown?: boolean;
  isInterception?: boolean;
  fumbleLost?: boolean;
}

/**
 * The only fields scoring reads. A form and a stored row both reduce to this,
 * which is what lets one `points()` serve both directions.
 */
export type ScoringFacts = Pick<
  Snap,
  'kind' | 'isTouchdown' | 'isDefensiveTouchdown' | 'result' | 'attemptType'
>;

/** Points per score. The only place these numbers appear. */
export const POINTS = {
  touchdown: 6,
  fieldGoal: 3,
  patKick: 1,
  twoPoint: 2,
  safety: 2,
} as const;

/** Four downs to make ten yards. */
export const FINAL_DOWN = 4;
