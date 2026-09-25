/**
 * A kick that changes possession: a kickoff or a punt. Both are fielded
 * somewhere downfield and run back the other way, and both treat a lost
 * fumble by the returner as the KICKING team's ball.
 */
import { type Possession, advanceBy } from '../../field';
import type { KickoffForm, PuntForm } from '../../playForm';
import type { GameState } from '../GameState';
import { PlayDefinition } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';

export abstract class KickPlay<F extends KickoffForm | PuntForm> extends PlayDefinition<F> {
  /** Where the kick is struck from. */
  protected abstract kickedFrom(state: GameState): number;

  /** How far it travelled before anyone touched it. */
  protected abstract kickLength(outcome: PlayOutcome): number;

  /**
   * Where the kick came down, before any return. Clamped by `advanceBy`, so
   * a kick into the end zone fields on the goal line rather than beyond it.
   */
  protected fieldedSpot(state: GameState, outcome: PlayOutcome): number {
    return advanceBy(this.kickedFrom(state), this.kickLength(outcome), state.offense);
  }

  /** Fielded, then run back toward the kicking team's goal. */
  protected returnedSpot(state: GameState, outcome: PlayOutcome, receiver: Possession): number {
    return advanceBy(this.fieldedSpot(state, outcome), outcome.data.returnYards ?? 0, receiver);
  }

  /**
   * A muffed kick. The one lost fumble that does NOT change hands: the ball
   * was already going to the other team, so the returner losing it means
   * the kicking team keeps it, where it was fielded.
   */
  protected afterTakeaway(state: GameState, outcome: PlayOutcome): GameState {
    return state.firstAndTen(this.fieldedSpot(state, outcome), state.offense, 'turnover');
  }
}
