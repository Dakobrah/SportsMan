/**
 * A play from scrimmage: the offense snaps it and tries to gain ground.
 * Run and pass share everything here -- the down-and-distance rules, who
 * made the stop, the scores the yardage implies, and scoring itself.
 */
import type { NewSnap } from '../../../db/repositories/snaps';
import { type Possession, reachesGoalLine, reachesOwnGoalLine, yardsToGoalFor } from '../../field';
import type { DefensiveDetail, PassForm, RunForm, ScrimmageFields } from '../../playForm';
import type { GameState } from '../GameState';
import { PlayDefinition } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';
import type { RosterLinks } from '../players';
import { FINAL_DOWN, POINTS, type ScoringFacts } from '../types';

export abstract class ScrimmagePlay<F extends RunForm | PassForm> extends PlayDefinition<F> {
  /**
   * How far the play actually moved the ball, from the form. Mirrors
   * `snapYardage` for a stored row: a sack is its loss, an incompletion is
   * nothing.
   */
  protected abstract yardsFrom(form: F): number;

  /** The defense ended up with the ball, so the carrier cannot have scored. */
  protected lostTheBall(form: F): boolean {
    return form.fumbleLost || form.isDefensiveTouchdown;
  }

  /**
   * Gain the yards; a first down resets the chains, otherwise it is the next
   * down, and failing on fourth hands the ball over where it stopped.
   */
  protected advance(state: GameState, outcome: PlayOutcome): GameState {
    const spot = state.spotAfter(outcome.yards);
    const toGo = state.toGo - outcome.yards;

    if (outcome.result.isFirstDown || toGo <= 0) {
      return state.firstAndTen(spot, state.offense);
    }
    if (state.currentDown >= FINAL_DOWN) {
      // Turnover on downs: the defense takes over exactly where the ball
      // stopped, facing the other way.
      return state.turnover(spot, 'turnover_on_downs');
    }
    return state.with({
      down: state.currentDown + 1,
      // Never more than the distance to the goal line (and goal), never
      // less than one -- there is no "second and zero".
      distance: Math.max(Math.min(toGo, yardsToGoalFor(spot, state.offense)), 1),
      ballPosition: spot,
      situation: 'normal',
    });
  }

  // -------------------------------------------------------------------------
  // What the yardage already says
  // -------------------------------------------------------------------------

  /** Did the carrier break the plane? Only a gain can, and only if he kept it. */
  scoresTouchdown(form: F, spot: number, offense: Possession): boolean {
    const yards = this.yardsFrom(form);
    return yards > 0 && !this.lostTheBall(form) && reachesGoalLine(spot, yards, offense);
  }

  /** Was the carrier downed in his own end zone? Only a loss can do that. */
  concedesSafety(form: F, spot: number, offense: Possession): boolean {
    const yards = this.yardsFrom(form);
    return yards < 0 && !this.lostTheBall(form) && reachesOwnGoalLine(spot, yards, offense);
  }

  derive(form: F, state: GameState): F {
    const isTouchdown = form.isTouchdown || this.scoresTouchdown(form, state.ballPosition, state.offense);
    const isSafety = form.isSafety || this.concedesSafety(form, state.ballPosition, state.offense);
    return isTouchdown === form.isTouchdown && isSafety === form.isSafety
      ? form
      : { ...form, isTouchdown, isSafety };
  }

  // -------------------------------------------------------------------------
  // The form and the row
  // -------------------------------------------------------------------------

  /** A blank run or pass: no call, no gain, no defender. */
  protected static blankScrimmage(): ScrimmageFields {
    return {
      tacklerNumber: null,
      assistNumbers: [],
      tackleForLoss: false,
      appliedPressure: false,
      forcedIncompletion: false,
      isDefensiveTouchdown: false,
      playId: null,
      formation: '',
      yardsGained: 0,
      isTouchdown: false,
      isSafety: false,
      isFirstDown: false,
      fumbled: false,
      fumbleLost: false,
      notes: '',
    };
  }

  /** The columns run and pass write the same way. */
  protected scrimmageColumns(form: F, links: RosterLinks): Partial<NewSnap> {
    return {
      ...this.defense(form, links),
      playId: form.playId,
      formation: form.formation,
      isTouchdown: form.isTouchdown,
      isSafety: form.isSafety,
      isFirstDown: form.isFirstDown,
      fumbled: form.fumbled,
      fumbleLost: form.fumbleLost,
    };
  }

  /**
   * Who on our defense made the play. These are our players even when the
   * opponent has the ball, so they resolve against our roster regardless.
   */
  private defense(form: DefensiveDetail, links: RosterLinks): Partial<NewSnap> {
    return {
      primaryPlayerNumber: form.tacklerNumber,
      primaryPlayerId: links.ours(form.tacklerNumber),
      tackleForLoss: form.tackleForLoss,
      appliedPressure: form.appliedPressure,
      forcedIncompletion: form.forcedIncompletion,
      isDefensiveTouchdown: form.isDefensiveTouchdown,
    };
  }

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------

  points(facts: ScoringFacts): number {
    if (facts.isTouchdown || facts.isDefensiveTouchdown) return POINTS.touchdown;
    return facts.isSafety ? POINTS.safety : 0;
  }

  scoringFacts(form: F): ScoringFacts {
    return {
      ...super.scoringFacts(form),
      isTouchdown: form.isTouchdown,
      isDefensiveTouchdown: form.isDefensiveTouchdown,
      isSafety: form.isSafety,
    };
  }
}
