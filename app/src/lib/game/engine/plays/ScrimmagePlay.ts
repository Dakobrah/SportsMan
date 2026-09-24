/**
 * A play from scrimmage: the offense snaps it and tries to gain ground.
 * Run and pass share everything here -- the down-and-distance rules, who
 * made the stop, and touchdown scoring.
 */
import type { NewSnap } from '../../../db/repositories/snaps';
import { yardsToGoalFor } from '../../field';
import type { DefensiveDetail, PassForm, RunForm } from '../../playForm';
import type { GameState } from '../GameState';
import { PlayDefinition } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';
import type { RosterLinks } from '../players';
import { FINAL_DOWN, POINTS, type ScoringFacts } from '../types';

export abstract class ScrimmagePlay<F extends RunForm | PassForm> extends PlayDefinition<F> {
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

  /** No defender recorded yet. */
  protected static noDefense(): DefensiveDetail {
    return {
      tacklerNumber: null,
      assistNumbers: [],
      tackleForLoss: false,
      appliedPressure: false,
      forcedIncompletion: false,
      isDefensiveTouchdown: false,
    };
  }

  /**
   * Who on our defense made the play. These are our players even when the
   * opponent has the ball, so they resolve against our roster regardless.
   */
  protected defense(form: DefensiveDetail, links: RosterLinks): Partial<NewSnap> {
    return {
      primaryPlayerNumber: form.tacklerNumber,
      primaryPlayerId: links.ours(form.tacklerNumber),
      tackleForLoss: form.tackleForLoss,
      appliedPressure: form.appliedPressure,
      forcedIncompletion: form.forcedIncompletion,
      isDefensiveTouchdown: form.isDefensiveTouchdown,
    };
  }

  points(facts: ScoringFacts): number {
    return facts.isTouchdown || facts.isDefensiveTouchdown ? POINTS.touchdown : 0;
  }

  scoringFacts(form: F): ScoringFacts {
    return {
      ...super.scoringFacts(form),
      isTouchdown: form.isTouchdown,
      isDefensiveTouchdown: form.isDefensiveTouchdown,
    };
  }
}
