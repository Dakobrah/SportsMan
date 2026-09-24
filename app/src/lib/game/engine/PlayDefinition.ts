/**
 * Everything the app knows about one kind of play, in one class.
 *
 * This replaces twelve parallel switches on the play type, spread across
 * five files: the state machine, the row mapping, scoring (twice, once per
 * direction), form metadata, blank forms, player defaults (twice), the
 * kind-to-type table, validation, jersey fields and the feed summary. Adding
 * a play type meant finding all twelve. Now it means writing one subclass
 * and registering it in `PlayRegistry`.
 *
 * Forms and rows stay plain objects -- Svelte binds form fields directly,
 * and rows cross the database boundary -- so the classes hold behaviour, not
 * data. Each is a stateless singleton.
 */
import type { NewSnap } from '../../db/repositories/snaps';
import type { Player, Snap, SnapKind } from '../../db/repositories/types';
import { type Possession, extraPointSpotFor, otherTeam, safetyKickSpotFor } from '../field';
import type { PlayDefaults, PlayForm } from '../playForm';
import type { GameState } from './GameState';
import type { PlayOutcome } from './PlayOutcome';
import { type PlayerLookup, RosterLinks } from './players';
import type { PlayType, ScoringFacts } from './types';

/** The part of a row every play writes the same way. */
export type RowHeader = Pick<
  NewSnap,
  'quarter' | 'down' | 'distance' | 'ballPosition' | 'possession' | 'notes'
>;

/** A jersey field on a form, and the number in it. */
export type JerseyField = [field: string, number: number | null];

export abstract class PlayDefinition<F extends PlayForm = PlayForm> {
  /** The form discriminator, e.g. 'run'. */
  abstract readonly type: PlayType;
  /** The stored row discriminator, e.g. 'RUN'. */
  abstract readonly kind: SnapKind;
  /** The form heading, e.g. 'Run Play'. */
  abstract readonly title: string;
  /** CSS colour for the form heading. Identifies the form; never the Save button. */
  abstract readonly accent: string;

  /** A new form for this play, before any defaults are applied. */
  abstract blank(): F;

  // -------------------------------------------------------------------------
  // The state machine -- a template method
  //
  // Scoring and takeaways end a play the same way whatever it was, so they
  // are decided here, once. A subclass supplies only what its own play does
  // when neither happened, and overrides a step when its rules differ.
  // -------------------------------------------------------------------------

  /** The state after this play, given the state before it. */
  next(state: GameState, outcome: PlayOutcome): GameState {
    const { result } = outcome;
    if (result.isTouchdown) return this.afterTouchdown(state, state.offense);
    // Scored by the team WITHOUT the ball -- an interception or fumble
    // returned all the way. Not always us: their defense can score too.
    if (result.isDefensiveTouchdown) return this.afterTouchdown(state, state.defense);
    if (result.isSafety) return this.afterSafety(state);
    if (outcome.isTakeaway) return this.afterTakeaway(state, outcome);
    return this.advance(state, outcome);
  }

  /** The scoring team keeps the ball for the try, snapped from the defense's 3. */
  protected afterTouchdown(state: GameState, scorer: Possession): GameState {
    return state.deadBall(extraPointSpotFor(scorer), scorer, 'extra_point');
  }

  /** Two points to the defense, then the team that conceded free-kicks from its own 20. */
  protected afterSafety(state: GameState): GameState {
    return state.deadBall(safetyKickSpotFor(state.offense), state.offense, 'kickoff');
  }

  /** The defense takes over where the play ended. */
  protected afterTakeaway(state: GameState, outcome: PlayOutcome): GameState {
    return state.turnover(state.spotAfter(outcome.yards));
  }

  /** What this play does when nobody scored and nobody took the ball away. */
  protected abstract advance(state: GameState, outcome: PlayOutcome): GameState;

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  /** The row to insert for `form`, played from `state`. */
  toRow(form: F, state: GameState, roster: Player[]): NewSnap {
    return {
      ...this.header(form, state),
      kind: this.kind,
      // Last, so a play that is not snapped from the cursor -- a kickoff, a
      // try -- can override the header's spot, down and distance.
      ...this.body(form, state, new RosterLinks(roster, state.possession)),
    };
  }

  protected header(form: F, state: GameState): RowHeader {
    return {
      quarter: state.quarter,
      down: state.down,
      distance: state.distance,
      ballPosition: state.ballPosition,
      // Stored so the play can be replayed in the right direction later.
      possession: state.possession,
      notes: form.notes,
    };
  }

  /** The columns specific to this play. */
  protected abstract body(form: F, state: GameState, links: RosterLinks): Partial<NewSnap>;

  /** One line for the play feed. */
  abstract summarize(snap: Snap, players: PlayerLookup): string;

  // -------------------------------------------------------------------------
  // Scoring
  //
  // One rule, read two ways. Django implemented scoring four times and its
  // inverse a fifth; the port still had two copies, one reading forms and
  // one reading rows, held together only by a test asserting they agreed.
  // A form now reduces to the same facts a row does, so they cannot differ.
  // -------------------------------------------------------------------------

  /** Points this play scores. Most plays score none. */
  points(_facts: ScoringFacts): number {
    return 0;
  }

  /** The facts `points` reads, taken from a form. */
  scoringFacts(_form: F): ScoringFacts {
    return {
      kind: this.kind,
      isTouchdown: false,
      isDefensiveTouchdown: false,
      isSafety: false,
      result: null,
      attemptType: null,
    };
  }

  /** Points the form would score if saved. */
  pointsFor(form: F): number {
    return this.points(this.scoringFacts(form));
  }

  /**
   * Which side the points go to: the team with the ball, except when the
   * defense scored -- a defensive touchdown or a safety. Applying them to us
   * regardless is how a 36-33 game once replayed as 69-0.
   */
  scorer(
    facts: Pick<ScoringFacts, 'isDefensiveTouchdown' | 'isSafety'>,
    possession: Possession,
  ): Possession {
    return facts.isDefensiveTouchdown || facts.isSafety ? otherTeam(possession) : possession;
  }

  /**
   * Facts the play implies that the coach need not mark: breaking the plane
   * is a touchdown, going down in your own end zone is a safety. Neither is
   * a judgement call. Derived once, before the row is written, because the
   * row, the points and the next state all read the same flags and have to
   * agree about them.
   */
  derive(form: F, _state: GameState): F {
    return form;
  }

  /** Would the play, as entered, carry the ball into the end zone? */
  scoresTouchdown(_form: F, _spot: number, _offense: Possession): boolean {
    return false;
  }

  /** Would it put the ball carrier down in his own end zone? */
  concedesSafety(_form: F, _spot: number, _offense: Possession): boolean {
    return false;
  }

  // -------------------------------------------------------------------------
  // The form
  // -------------------------------------------------------------------------

  /** Throws a `ValidationError` naming the field to fix. */
  validate(_form: F): void {}

  /** Which fields hold a jersey number, for range checking. */
  jerseyFields(_form: F): JerseyField[] {
    return [];
  }

  /** Pre-fill the form with whoever last filled each role. */
  applyDefaults(form: F, _defaults: PlayDefaults): F {
    return form;
  }

  /** Fold a saved form into the running defaults. */
  remember(defaults: PlayDefaults, _form: F): PlayDefaults {
    return defaults;
  }
}
