/**
 * Down-and-distance state machine.
 *
 * Ported from `apps/core/helpers.py:compute_next_state`, with two families of
 * correction.
 *
 * The first is coordinates. The Python version mixed two conventions: it
 * returned `35` for a kickoff spot and `-20` for a touchback, which under the
 * documented -50..+50 scheme mean "opponent's 15" and "our own 30" rather
 * than "our own 35" and "their own 20". Those are now named spots from
 * field.ts and correct by construction. It also left the first-down path
 * unclamped, so a gain could put the ball past the goal line at +51.
 *
 * The second is possession, and it is the bigger one. The original model was
 * possession-relative: a change of possession mirrored the ball across
 * midfield (`flip`), so an interception at the opponent's 20 re-read as our
 * own 20 and the ball jumped the width of the field. On a real field a
 * turnover moves nobody; the other team takes over on that spot and runs the
 * other way. The frame here is absolute -- -50 is always the end zone we
 * defend -- and `possession` says who is driving. A turnover therefore
 * changes `possession` and the down, and leaves the ball where the play
 * ended.
 */
import {
  FIRST_DOWN_DISTANCE,
  type Possession,
  advanceBy,
  clamp,
  extraPointSpotFor,
  firstDownDistanceFor,
  kickoffSpotFor,
  kickoffTouchbackSpotFor,
  otherTeam,
  puntTouchbackSpotFor,
  yardsToGoalFor,
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
  /** Who has the ball. Defaults to 'us' for states recorded before this existed. */
  possession?: Possession;
}

export interface NextState {
  down: number | null;
  distance: number | null;
  ballPosition: number;
  situation: Situation;
  possession: Possession;
}

/** Fields the client submits with a play. */
export interface PlayData {
  puntYards?: number;
  kickYards?: number;
  /** Yards the return advanced the ball, from where it was fielded. */
  returnYards?: number;
  isFairCatch?: boolean;
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
  isDefensiveTouchdown?: boolean;
  isFirstDown?: boolean;
  isInterception?: boolean;
  fumbleLost?: boolean;
}

const FINAL_DOWN = 4;

/**
 * Where a kick came down, before any return.
 *
 * A punt travels from the line of scrimmage; a kickoff from the kicking
 * team's own 35, whatever the cursor happened to say. Clamped, so a kick
 * into the end zone fields on the goal line rather than beyond it.
 */
function fieldedSpot(
  ballPosition: number,
  playType: 'punt' | 'kickoff',
  kicker: Possession,
  playData: PlayData,
): number {
  const from = playType === 'punt' ? ballPosition : kickoffSpotFor(kicker);
  const distance = playType === 'punt' ? (playData.puntYards ?? 0) : (playData.kickYards ?? 0);
  return advanceBy(from, distance, kicker);
}

/** A fresh set of downs at `ballPosition` for `team`, respecting goal-to-go. */
function firstAndTen(
  ballPosition: number,
  team: Possession,
  situation: Situation,
): NextState {
  const position = clamp(ballPosition);
  return {
    down: 1,
    distance: firstDownDistanceFor(position, team),
    ballPosition: position,
    situation,
    possession: team,
  };
}

/** A dead-ball state with no down — kickoffs and PATs. */
function deadBall(
  ballPosition: number,
  team: Possession,
  situation: Situation,
): NextState {
  return {
    down: null,
    distance: null,
    ballPosition: clamp(ballPosition),
    situation,
    possession: team,
  };
}

/**
 * The other team takes over.
 *
 * The ball does not move: only who is driving, and which way, changes. This
 * is the single most important difference from the Django original.
 */
function turnover(ballPosition: number, from: Possession, situation: Situation): NextState {
  return firstAndTen(ballPosition, otherTeam(from), situation);
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
  const offense = current.possession ?? 'us';
  const yards = result.yardsGained ?? 0;

  // Scoring and turnovers short-circuit, whatever the play type was.
  if (result.isTouchdown) {
    // The scoring team keeps the ball for the try, snapped from the
    // defending team's 3.
    return deadBall(extraPointSpotFor(offense), offense, 'extra_point');
  }
  if (result.isDefensiveTouchdown) {
    // Our defense scored: we keep the ball for the try, snapped from our
    // own 3 (the opponent's end zone is behind them).
    return deadBall(extraPointSpotFor('us'), 'us', 'extra_point');
  }
  if (result.isInterception || result.fumbleLost) {
    // A muffed kick is the one lost fumble that does NOT change hands: on a
    // punt or kickoff the ball is already travelling to the other team, so
    // the returning team losing it means the KICKING team keeps possession.
    // Handled here rather than in the kick branches because the turnover
    // short-circuit runs first.
    if (playType === 'punt' || playType === 'kickoff') {
      return firstAndTen(fieldedSpot(ballPosition, playType, offense, playData), offense, 'turnover');
    }
    // Otherwise: where the play ended, then possession changes. The spot is
    // unchanged by the change itself.
    return turnover(advanceBy(ballPosition, yards, offense), offense, 'turnover');
  }

  switch (playType) {
    case 'kickoff': {
      const receiver = otherTeam(offense);
      if (playData.isTouchback) {
        return firstAndTen(kickoffTouchbackSpotFor(receiver), receiver, 'normal');
      }
      // Without a kick distance there is no landing spot to compute, so
      // fall back to the touchback spot -- the same answer this gave before
      // returns existed.
      if (!playData.kickYards) {
        return firstAndTen(kickoffTouchbackSpotFor(receiver), receiver, 'normal');
      }
      // Fielded where the kick came down, then run back the other way.
      const fielded = fieldedSpot(ballPosition, 'kickoff', offense, playData);
      const returned = advanceBy(fielded, playData.returnYards ?? 0, receiver);
      return firstAndTen(returned, receiver, 'normal');
    }

    case 'punt': {
      const receiver = otherTeam(offense);
      if (playData.isTouchback) {
        return firstAndTen(puntTouchbackSpotFor(receiver), receiver, 'opponent_ball');
      }
      const fielded = fieldedSpot(ballPosition, 'punt', offense, playData);
      // A fair catch is a return of zero by definition.
      const returned = playData.isFairCatch
        ? fielded
        : advanceBy(fielded, playData.returnYards ?? 0, receiver);
      return firstAndTen(returned, receiver, 'opponent_ball');
    }

    case 'field_goal':
      return playData.result === 'GOOD'
        // The scoring team kicks off from its own 35.
        ? deadBall(kickoffSpotFor(offense), offense, 'kickoff')
        // A miss hands the ball over on the spot.
        : turnover(ballPosition, offense, 'opponent_ball');

    case 'extra_point':
      return deadBall(kickoffSpotFor(offense), offense, 'kickoff');

    case 'penalty':
      return applyPenalty(down, distance, ballPosition, offense, playData);

    default:
      return applyScrimmagePlay(down, distance, ballPosition, offense, yards, result);
  }
}

function applyPenalty(
  down: number,
  distance: number,
  ballPosition: number,
  offense: Possession,
  playData: PlayData,
): NextState {
  const penaltyYards = playData.penaltyYards ?? 0;
  const onOffense = playData.onOffense ?? true;

  // A declined penalty is no play at all: the down still advances.
  if (playData.accepted === false) {
    return {
      down: down + 1,
      distance,
      ballPosition: clamp(ballPosition),
      situation: 'normal',
      possession: offense,
    };
  }

  // Against the team with the ball it goes backward and the distance grows;
  // against the defence, the reverse. Both are expressed in the offence's
  // direction of travel.
  const signed = onOffense ? -penaltyYards : penaltyYards;
  const newPosition = advanceBy(ballPosition, signed, offense);
  const newDistance = distance - signed;

  if (playData.autoFirstDown || newDistance <= 0) {
    return firstAndTen(newPosition, offense, 'normal');
  }
  return {
    down,
    distance: Math.min(newDistance, yardsToGoalFor(newPosition, offense)),
    ballPosition: newPosition,
    situation: 'normal',
    possession: offense,
  };
}

function applyScrimmagePlay(
  down: number,
  distance: number,
  ballPosition: number,
  offense: Possession,
  yards: number,
  result: PlayResult,
): NextState {
  const newPosition = advanceBy(ballPosition, yards, offense);
  const newDistance = distance - yards;

  if (result.isFirstDown || newDistance <= 0) {
    return firstAndTen(newPosition, offense, 'normal');
  }
  if (down + 1 > FINAL_DOWN) {
    // Turnover on downs: the defence takes over exactly where the ball
    // stopped, facing the other way.
    return turnover(newPosition, offense, 'turnover_on_downs');
  }
  return {
    down: down + 1,
    distance: Math.max(Math.min(newDistance, yardsToGoalFor(newPosition, offense)), 1),
    ballPosition: newPosition,
    situation: 'normal',
    possession: offense,
  };
}
