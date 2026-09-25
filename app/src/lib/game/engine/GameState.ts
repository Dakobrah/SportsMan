/**
 * Where a game stands between snaps: quarter, down and distance, the spot,
 * who has the ball, and what kind of snap comes next.
 *
 * Replaces three interfaces that described the same thing -- `GameState`
 * (the state machine's input), `NextState` (its output) and `GameCursor`
 * (what the tracker persists) -- which differed only in whether the quarter
 * was present and whether fields were nullable.
 *
 * Immutable. Every transition returns a new state, so a Svelte component
 * holding one reacts to reassignment and a caller can never see a half-
 * applied play.
 */
import type { Situation } from '../../db/repositories/types';
import {
  FIRST_DOWN_DISTANCE,
  type Possession,
  advanceBy,
  clamp,
  firstDownDistanceFor,
  otherTeam,
  yardsToGoalFor,
  yardsToOwnGoalFor,
} from '../field';
import { Ruleset } from './Ruleset';
import { QUARTERS_PER_HALF } from './types';

/**
 * The persisted shape: the `games.current_*` columns. Stays a plain
 * interface because it crosses the database and `$state` boundaries, where
 * class instances are not wanted.
 */
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

/** A transition's result before a quarter is attached. */
export type NextState = Omit<GameCursor, 'quarter'>;

export class GameState implements GameCursor {
  readonly quarter: number;
  readonly down: number | null;
  readonly distance: number | null;
  readonly ballPosition: number;
  readonly situation: Situation;
  readonly possession: Possession;

  constructor(fields: GameCursor) {
    this.quarter = fields.quarter;
    this.down = fields.down;
    this.distance = fields.distance;
    this.ballPosition = fields.ballPosition;
    this.situation = fields.situation;
    this.possession = fields.possession;
  }

  /**
   * Q1, first and ten for us after a touchback on the opening kick -- the
   * tracker starts with the kick assumed. Where that leaves the ball is the
   * rulebook's touchback line: our 25 in college, which is also the schema's
   * column default.
   */
  static opening(rules: Ruleset = Ruleset.default): GameState {
    return new GameState({
      quarter: 1,
      down: 1,
      distance: FIRST_DOWN_DISTANCE,
      ballPosition: rules.kickoffTouchbackSpotFor('us'),
      situation: 'normal',
      possession: 'us',
    });
  }

  static from(cursor: GameCursor): GameState {
    return cursor instanceof GameState ? cursor : new GameState(cursor);
  }

  // -------------------------------------------------------------------------
  // The situation, in a coach's words
  // -------------------------------------------------------------------------

  /** The team with the ball. */
  get offense(): Possession {
    return this.possession;
  }

  /** The team without it. */
  get defense(): Possession {
    return otherTeam(this.possession);
  }

  /** The down being played. A dead-ball state (kickoff, try) reads as first. */
  get currentDown(): number {
    return this.down ?? 1;
  }

  /** Yards needed for a first down -- "third and seven to go". */
  get toGo(): number {
    return this.distance ?? FIRST_DOWN_DISTANCE;
  }

  /** Yards from the ball to the end zone the offense is attacking. */
  get yardsToGoal(): number {
    return yardsToGoalFor(this.ballPosition, this.offense);
  }

  /** Yards from the ball back to the goal line the offense defends. */
  get yardsToOwnGoal(): number {
    return yardsToOwnGoalFor(this.ballPosition, this.offense);
  }

  /** Where the ball ends up if the offense moves it `yards`. */
  spotAfter(yards: number): number {
    return advanceBy(this.ballPosition, yards, this.offense);
  }

  // -------------------------------------------------------------------------
  // Transitions. Each returns a new state in the same quarter.
  // -------------------------------------------------------------------------

  /** Any change, keeping the quarter. */
  with(changes: Partial<NextState>): GameState {
    return new GameState({ ...this.toCursor(), ...changes });
  }

  /** A fresh set of downs for `team` at `spot`, respecting first and goal. */
  firstAndTen(spot: number, team: Possession, situation: Situation = 'normal'): GameState {
    const ball = clamp(spot);
    return this.with({
      down: 1,
      distance: firstDownDistanceFor(ball, team),
      ballPosition: ball,
      situation,
      possession: team,
    });
  }

  /** A dead ball with no down -- a kickoff or a try is next. */
  deadBall(spot: number, team: Possession, situation: Situation): GameState {
    return this.with({
      down: null,
      distance: null,
      ballPosition: clamp(spot),
      situation,
      possession: team,
    });
  }

  /**
   * The other team takes over at `spot`.
   *
   * The ball does not move on the change itself: only who is driving, and
   * which way, changes. An interception at their 20 is first down for them
   * at their 20, not a jump the width of the field.
   */
  turnover(spot: number, situation: Situation = 'turnover'): GameState {
    return this.firstAndTen(spot, this.defense, situation);
  }

  /**
   * The coach moved the game to `quarter`.
   *
   * Crossing halftime ends whatever drive was on: the third quarter opens
   * with a kickoff by `secondHalfKicker`. The breaks after the first and
   * third quarters only change ends, which is presentation -- the drive
   * carries on exactly where it was.
   */
  toQuarter(quarter: number, secondHalfKicker: Possession, rules: Ruleset = Ruleset.default): GameState {
    const crossesHalftime = this.quarter <= QUARTERS_PER_HALF && quarter > QUARTERS_PER_HALF;
    if (!crossesHalftime) return new GameState({ ...this.toCursor(), quarter });
    return new GameState({
      quarter,
      down: null,
      distance: null,
      ballPosition: rules.kickoffSpotFor(secondHalfKicker),
      situation: 'kickoff',
      possession: secondHalfKicker,
    });
  }

  // -------------------------------------------------------------------------
  // Plain views, for the database and for Svelte `$state`
  // -------------------------------------------------------------------------

  toCursor(): GameCursor {
    return {
      quarter: this.quarter,
      down: this.down,
      distance: this.distance,
      ballPosition: this.ballPosition,
      situation: this.situation,
      possession: this.possession,
    };
  }

  toNextState(): NextState {
    const { quarter: _quarter, ...next } = this.toCursor();
    return next;
  }
}
