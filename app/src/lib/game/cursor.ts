/**
 * Where a game currently stands, and how it moves.
 *
 * The important function here is `cursorAfter`. Django rebuilt the tracker's
 * resume state from the last snap's own down/distance/ball_position
 * (apps/frontend/tracker.py:377-389), but a snap records the state *before*
 * that play ran — so every reload rewound exactly one play. The state after
 * a stored snap is `computeNextState` applied to it, which is what this
 * computes.
 */
import type { Database } from '../db/driver';
import { lastSnap } from '../db/repositories/snaps';
import type { Situation, Snap, SnapKind } from '../db/repositories/types';
import { snapYardage } from './summary';
import { FIRST_DOWN_DISTANCE, KICKOFF_TOUCHBACK_SPOT, type Possession } from './field';
import {
  computeNextState,
  type GameState,
  type NextState,
  type PlayData,
  type PlayResult,
  type PlayType,
} from './nextState';

export interface GameCursor {
  quarter: number;
  down: number | null;
  distance: number | null;
  ballPosition: number;
  situation: Situation;
  /**
   * Who has the ball. The coordinate frame is absolute, so this -- not the
   * sign of ballPosition -- is what a turnover changes.
   */
  possession: Possession;
}

/** Q1, first and ten on our own 25 — matching the schema's column defaults. */
export const OPENING_CURSOR: GameCursor = {
  quarter: 1,
  down: 1,
  distance: FIRST_DOWN_DISTANCE,
  ballPosition: KICKOFF_TOUCHBACK_SPOT,
  situation: 'normal',
  possession: 'us',
};

/**
 * Fold a computed next state into the cursor.
 *
 * The quarter carries over untouched: `computeNextState` has no clock and no
 * concept of a period, so only the coach changes it.
 */
export const advance = (cursor: GameCursor, next: NextState): GameCursor => ({
  quarter: cursor.quarter,
  down: next.down,
  distance: next.distance,
  ballPosition: next.ballPosition,
  situation: next.situation,
  possession: next.possession,
});

const PLAY_TYPE_BY_KIND: Record<SnapKind, PlayType> = {
  RUN: 'run',
  PASS: 'pass',
  PENALTY: 'penalty',
  KICKOFF: 'kickoff',
  PUNT: 'punt',
  FG: 'field_goal',
  XP: 'extra_point',
  // A defensive stop is still a scrimmage down from our point of view.
  DEFENSE: 'run',
};

export const playTypeOf = (kind: SnapKind): PlayType => PLAY_TYPE_BY_KIND[kind];

export const snapToGameState = (snap: Snap): GameState => ({
  down: snap.down,
  distance: snap.distance,
  ballPosition: snap.ballPosition,
  possession: snap.possession,
});

export const snapToPlayData = (snap: Snap): PlayData => ({
  puntYards: snap.puntYards,
  kickYards: snap.kickYards,
  returnYards: snap.returnYards,
  isFairCatch: snap.isFairCatch,
  isTouchback: snap.isTouchback,
  result: snap.result ?? undefined,
  penaltyYards: snap.penaltyYards ?? undefined,
  onOffense: snap.penaltyOnOffense ?? undefined,
  accepted: snap.penaltyAccepted ?? undefined,
});

export const snapToPlayResult = (snap: Snap): PlayResult => ({
  /**
   * A sack stores its loss in `sackYards` with `yardsGained` left at zero,
   * matching Django's shape and what the passing reports expect. Feeding
   * that zero to the state machine meant a sack moved the ball nowhere and
   * never grew the distance -- replaying a real game showed 1st & 10 after
   * an eight-yard sack where the field said 2nd & 18. `snapYardage` is the
   * one definition of what a play actually moved the ball.
   */
  yardsGained: snapYardage(snap),
  isTouchdown: snap.isTouchdown,
  isDefensiveTouchdown: snap.isDefensiveTouchdown,
  isFirstDown: snap.isFirstDown,
  isInterception: snap.isInterception,
  fumbleLost: snap.fumbleLost,
});

/** The state a game is in once `snap` has been played. */
export function cursorAfter(snap: Snap): GameCursor {
  const next = computeNextState(
    snapToGameState(snap),
    playTypeOf(snap.kind),
    snapToPlayData(snap),
    snapToPlayResult(snap),
  );
  return advance({ ...OPENING_CURSOR, quarter: snap.quarter }, next);
}

/**
 * Derive a game's cursor from its plays. The fallback when `games.current_*`
 * is unset, and the repair applied after an import or an undo.
 */
export async function rebuildCursor(db: Database, gameId: number): Promise<GameCursor> {
  const snap = await lastSnap(db, gameId);
  return snap ? cursorAfter(snap) : OPENING_CURSOR;
}
