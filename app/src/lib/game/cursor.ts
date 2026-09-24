/**
 * Where a game currently stands, and how it moves.
 *
 * The important function here is `cursorAfter`. Django rebuilt the tracker's
 * resume state from the last snap's own down/distance/ball_position
 * (apps/frontend/tracker.py:377-389), but a snap records the state *before*
 * that play ran -- so every reload rewound exactly one play. The state after
 * a stored snap is that play's transition applied to it, which is what this
 * computes.
 */
import type { Database } from '../db/driver';
import { lastSnap } from '../db/repositories/snaps';
import type { Snap, SnapKind } from '../db/repositories/types';
import { type GameCursor, GameState, type NextState } from './engine/GameState';
import { PlayOutcome } from './engine/PlayOutcome';
import { plays } from './engine/PlayRegistry';
import type { PlayType } from './engine/types';

export type { GameCursor };

/** Q1, first and ten on our own 25 -- matching the schema's column defaults. */
export const OPENING_CURSOR: GameCursor = GameState.opening().toCursor();

/**
 * Fold a computed next state into the cursor.
 *
 * The quarter carries over untouched: a transition has no clock and no
 * concept of a period, so only the coach changes it.
 */
export const advance = (cursor: GameCursor, next: NextState): GameCursor => ({
  ...next,
  quarter: cursor.quarter,
});

export const playTypeOf = (kind: SnapKind): PlayType => plays.forKind(kind).type;

/** The state a game is in once `snap` has been played. */
export function stateAfter(snap: Snap): GameState {
  const before = new GameState({
    quarter: snap.quarter,
    down: snap.down,
    distance: snap.distance,
    ballPosition: snap.ballPosition ?? 0,
    situation: 'normal',
    possession: snap.possession ?? 'us',
  });
  return plays.forKind(snap.kind).next(before, PlayOutcome.fromSnap(snap));
}

/** As `stateAfter`, as the plain shape the tracker persists. */
export function cursorAfter(snap: Snap): GameCursor {
  return stateAfter(snap).toCursor();
}

/**
 * Derive a game's cursor from its plays. The fallback when `games.current_*`
 * is unset, and the repair applied after an import or an undo.
 */
export async function rebuildCursor(db: Database, gameId: number): Promise<GameCursor> {
  const snap = await lastSnap(db, gameId);
  return snap ? cursorAfter(snap) : OPENING_CURSOR;
}
