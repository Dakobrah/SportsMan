/**
 * Down-and-distance state machine -- the function-shaped entry point.
 *
 * The rules themselves live in the play classes under `engine/`: each play
 * type's `next()` owns its own transition, and the scoring and takeaway
 * short-circuits every play shares are decided once in `PlayDefinition`.
 * This module keeps the original signature for callers that have a play
 * type and loose facts rather than a stored row.
 *
 * Two corrections from the Django original are worth keeping in mind, since
 * every rule below depends on them. Coordinates are absolute -- -50 is
 * always the end zone we defend -- so a named spot is correct by
 * construction rather than a bare `35` that meant the opponent's 15. And a
 * turnover moves nobody: the other team takes over on that spot and runs
 * the other way, where the original mirrored the ball across midfield.
 */
import type { Situation } from '../db/repositories/types';
import type { Possession } from './field';
import { GameState, type NextState } from './engine/GameState';
import { PlayOutcome } from './engine/PlayOutcome';
import { plays } from './engine/PlayRegistry';
import type { PlayData, PlayResult, PlayType } from './engine/types';

export type { NextState, PlayData, PlayResult, PlayType, Situation };

/** The situation a play starts from. Nullable where a dead ball has none. */
export interface StateInput {
  down: number | null;
  distance: number | null;
  ballPosition: number | null;
  /** Who has the ball. Defaults to 'us' for states recorded before this existed. */
  possession?: Possession;
}

export function computeNextState(
  current: StateInput,
  playType: PlayType,
  playData: PlayData = {},
  result: PlayResult = {},
): NextState {
  const state = new GameState({
    // The machine has no clock; a quarter is attached by the caller.
    quarter: 1,
    down: current.down,
    distance: current.distance,
    ballPosition: current.ballPosition ?? 0,
    situation: 'normal',
    possession: current.possession ?? 'us',
  });
  return plays.forType(playType).next(state, new PlayOutcome(playData, result)).toNextState();
}
