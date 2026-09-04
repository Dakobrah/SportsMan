/**
 * Down-and-distance state machine.
 *
 * Ported from `apps/core/helpers.py:compute_next_state`, with the field
 * coordinates corrected. The Python version mixed two conventions: it
 * returned `35` for a kickoff spot and `-20` for a touchback, which under the
 * documented -50..+50 scheme mean "opponent's 15" and "our own 30" rather
 * than "our own 35" and "their own 20". Those are now expressed as named
 * spots from `field.ts` and are correct by construction.
 *
 * Also fixed: the original returned an unclamped position on the first-down
 * path, so a gain could put the ball past the goal line at +51. Clamping is
 * applied on every path here.
 */
import {
  EXTRA_POINT_SPOT,
  FIRST_DOWN_DISTANCE,
  KICKOFF_SPOT,
  KICKOFF_TOUCHBACK_SPOT,
  PUNT_TOUCHBACK_SPOT,
  clamp,
  firstDownDistance,
  flip,
  yardsToGoal,
} from './field';

export type Situation =
  | 'normal'
  | 'extra_point'
  | 'kickoff'
  | 'turnover'
  | 'turnover_on_downs'
  | 'opponent_ball';

export type PlayType =
  | 'run'
  | 'pass'
  | 'penalty'
  | 'kickoff'
  | 'punt'
  | 'field_goal'
  | 'extra_point';

export interface GameState {
  down: number | null;
  distance: number | null;
  ballPosition: number | null;
}

export interface NextState {
  down: number | null;
  distance: number | null;
  ballPosition: number;
  situation: Situation;
}

/** Fields the client submits with a play. */
export interface PlayData {
  puntYards?: number;
  isTouchback?: boolean;
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
  isFirstDown?: boolean;
  isInterception?: boolean;
  fumbleLost?: boolean;
}

const FINAL_DOWN = 4;

/** A fresh set of downs at `ballPosition`, respecting goal-to-go. */
function firstAndTen(ballPosition: number, situation: Situation): NextState {
  const position = clamp(ballPosition);
  return {
    down: 1,
    distance: firstDownDistance(position),
    ballPosition: position,
    situation,
  };
}

/** A dead-ball state with no down — kickoffs and PATs. */
function deadBall(ballPosition: number, situation: Situation): NextState {
  return { down: null, distance: null, ballPosition: clamp(ballPosition), situation };
}

/** The opponent takes over at this spot, expressed from their point of view. */
function possessionChange(ballPosition: number, situation: Situation): NextState {
  return firstAndTen(flip(ballPosition), situation);
}

export function computeNextState(
  current: GameState,
  playType: PlayType,
  playData: PlayData = {},
  result: PlayResult = {},
): NextState {
  const down = current.down ?? 1;
  const distance = current.distance ?? FIRST_DOWN_DISTANCE;
  const ballPosition = current.ballPosition ?? 0;
  const yards = result.yardsGained ?? 0;

  // Scoring and turnovers short-circuit, whatever the play type was.
  if (result.isTouchdown) return deadBall(EXTRA_POINT_SPOT, 'extra_point');
  if (result.isInterception || result.fumbleLost) {
    return possessionChange(ballPosition + yards, 'turnover');
  }

  switch (playType) {
    case 'kickoff':
      // A returned kick is recorded as its own play, so every kickoff lands
      // the receiving team on their own 25 here.
      return firstAndTen(KICKOFF_TOUCHBACK_SPOT, 'normal');

    case 'punt':
      // Both branches state the result in the RECEIVING team's terms: a
      // touchback is their own 20, and a returned punt is our spot flipped.
      return playData.isTouchback
        ? firstAndTen(PUNT_TOUCHBACK_SPOT, 'opponent_ball')
        : possessionChange(ballPosition + (playData.puntYards ?? 0), 'opponent_ball');

    case 'field_goal':
      return playData.result === 'GOOD'
        ? deadBall(KICKOFF_SPOT, 'kickoff')
        : possessionChange(ballPosition, 'opponent_ball');

    case 'extra_point':
      return deadBall(KICKOFF_SPOT, 'kickoff');

    case 'penalty':
      return applyPenalty(down, distance, ballPosition, playData);

    default:
      return applyScrimmagePlay(down, distance, ballPosition, yards, result);
  }
}

function applyPenalty(
  down: number,
  distance: number,
  ballPosition: number,
  playData: PlayData,
): NextState {
  const penaltyYards = playData.penaltyYards ?? 0;
  const onOffense = playData.onOffense ?? true;

  // A declined penalty is no play at all: the down still advances.
  if (playData.accepted === false) {
    return { down: down + 1, distance, ballPosition: clamp(ballPosition), situation: 'normal' };
  }

  // Against us the ball goes back and the distance grows; against them the
  // reverse.
  const direction = onOffense ? -1 : 1;
  const newPosition = ballPosition + direction * penaltyYards;
  const newDistance = distance - direction * penaltyYards;

  if (playData.autoFirstDown || newDistance <= 0) {
    return firstAndTen(newPosition, 'normal');
  }
  const position = clamp(newPosition);
  return {
    down,
    distance: Math.min(newDistance, yardsToGoal(position)),
    ballPosition: position,
    situation: 'normal',
  };
}

function applyScrimmagePlay(
  down: number,
  distance: number,
  ballPosition: number,
  yards: number,
  result: PlayResult,
): NextState {
  const newPosition = ballPosition + yards;
  const newDistance = distance - yards;

  if (result.isFirstDown || newDistance <= 0) {
    return firstAndTen(newPosition, 'normal');
  }
  if (down + 1 > FINAL_DOWN) {
    return possessionChange(newPosition, 'turnover_on_downs');
  }
  const position = clamp(newPosition);
  return {
    down: down + 1,
    distance: Math.max(Math.min(newDistance, yardsToGoal(position)), 1),
    ballPosition: position,
    situation: 'normal',
  };
}
