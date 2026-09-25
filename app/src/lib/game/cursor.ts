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
import { rulesetForGame } from '../db/repositories/seasons';
import { lastSnap } from '../db/repositories/snaps';
import type { Snap, SnapKind } from '../db/repositories/types';
import { type GameCursor, GameState, type NextState } from './engine/GameState';
import { PlayOutcome } from './engine/PlayOutcome';
import { PlayRegistry, plays } from './engine/PlayRegistry';
import { Ruleset } from './engine/Ruleset';
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

/** The rules a game's season is played under. */
export async function rulesForGame(db: Database, gameId: number): Promise<Ruleset> {
  return Ruleset.for(await rulesetForGame(db, gameId));
}

/** The state a game is in once `snap` has been played, under `rules`. */
export function stateAfter(snap: Snap, rules: Ruleset = Ruleset.default): GameState {
  const before = new GameState({
    quarter: snap.quarter,
    down: snap.down,
    distance: snap.distance,
    ballPosition: snap.ballPosition ?? 0,
    situation: 'normal',
    possession: snap.possession ?? 'us',
  });
  return PlayRegistry.for(rules).forKind(snap.kind).next(before, PlayOutcome.fromSnap(snap));
}

/** As `stateAfter`, as the plain shape the tracker persists. */
export function cursorAfter(snap: Snap, rules: Ruleset = Ruleset.default): GameCursor {
  return stateAfter(snap, rules).toCursor();
}

/**
 * Derive a game's cursor from its plays. The fallback when `games.current_*`
 * is unset, and the repair applied after an import or an undo.
 *
 * Looks the game's rules up itself when not handed them, so no caller can
 * replay a high-school game under college rules by forgetting to pass them.
 */
export async function rebuildCursor(
  db: Database,
  gameId: number,
  rules?: Ruleset,
): Promise<GameCursor> {
  const resolved = rules ?? (await rulesForGame(db, gameId));
  const snap = await lastSnap(db, gameId);
  return snap ? cursorAfter(snap, resolved) : GameState.opening(resolved).toCursor();
}
