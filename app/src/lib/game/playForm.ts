/**
 * What the coach filled in, as typed data.
 *
 * Django's tracker built each of these as an HTML string and read the values
 * back out of the DOM (static/js/tracker.js). Four hardcoded arrays existed
 * purely to keep radio-style toggles mutually exclusive
 * (tracker.js:878-895). Expressed as a discriminated union those arrays
 * disappear: `result: 'GOOD' | 'MISS' | 'BLOCK'` cannot hold two values at
 * once, so exclusivity is a property of the type rather than something a
 * click handler has to maintain.
 */
import type { Play, Player, Position, Possession } from '../db/repositories/types';
import { type GameCursor, GameState } from './engine/GameState';
import { plays } from './engine/PlayRegistry';
import { Ruleset } from './engine/Ruleset';
import { fieldGoalDistance, yardsToOwnGoalFor } from './field';

export type PlayFormType =
  | 'run'
  | 'pass'
  | 'penalty'
  | 'kickoff'
  | 'punt'
  | 'field_goal'
  | 'extra_point';

/**
 * Who on our defense made the play.
 *
 * Carried on the OPPONENT'S offensive forms rather than on a form of its
 * own: one play happened, so one row records it. A separate defensive snap
 * per play would double every play count and break sequence numbering,
 * which the cursor and drive segmentation both read as one row per play.
 *
 * These are our players even though the opponent has the ball, so they
 * resolve against our roster regardless of possession -- see `toSnapRow`.
 */
export interface DefensiveDetail {
  /** The primary tackler, sacker, interceptor or defender. */
  tacklerNumber: number | null;
  /** Everyone else in on it. */
  assistNumbers: number[];
  tackleForLoss: boolean;
  /** Pass plays only: pressure that did not become a sack. */
  appliedPressure: boolean;
  /** Pass plays only: a pass broken up. */
  forcedIncompletion: boolean;
  isDefensiveTouchdown: boolean;
}

/**
 * What run and pass share: the call, the gain, and how the down ended. Both
 * forms declared all of this separately.
 */
export interface ScrimmageFields extends DefensiveDetail {
  /** The call. `formation` is stored alongside so a game survives a
   *  playbook edit -- the same reasoning as the jersey numbers. */
  playId: number | null;
  formation: string;
  yardsGained: number;
  isTouchdown: boolean;
  /**
   * The ball carrier went down in his own end zone: two points to the
   * defense. Derived from the yardage like a touchdown, so it is scored
   * even when nobody presses it.
   */
  isSafety: boolean;
  isFirstDown: boolean;
  fumbled: boolean;
  fumbleLost: boolean;
  notes: string;
}

export interface RunForm extends ScrimmageFields {
  type: 'run';
  /** The jersey number the coach typed. Resolved to a roster player only
   *  when we have the ball -- their #22 is not our #22. */
  ballCarrierNumber: number | null;
}

export interface PassForm extends ScrimmageFields {
  type: 'pass';
  quarterbackNumber: number | null;
  /** Who the ball was thrown at. Set on every attempt, caught or not. */
  targetNumber: number | null;
  /** Who caught it. Only meaningful on a completion. */
  receiverNumber: number | null;
  isComplete: boolean;
  wasSacked: boolean;
  /**
   * How far the ball travelled in the air. Yards after the catch are
   * DERIVED as `yardsGained - airYards` rather than entered, so the two
   * cannot contradict the total.
   */
  airYards: number;
  isThrownAway: boolean;
  /** Our passer was pressured. The defensive mirror is `appliedPressure`. */
  wasUnderPressure: boolean;
  isInterception: boolean;
}

export interface PenaltyForm {
  type: 'penalty';
  penaltyName: string;
  penaltyYards: number;
  onOffense: boolean;
  accepted: boolean;
  autoFirstDown: boolean;
  notes: string;
}

export interface KickoffForm {
  type: 'kickoff';
  kickerNumber: number | null;
  kickYards: number;
  isTouchback: boolean;
  isOnsideKick: boolean;
  /** Only with `isOnsideKick`: the kicking team came up with it. */
  onsideRecovered: boolean;
  outOfBounds: boolean;
  /** The return rides on this row; see 006_returns.sql. */
  returnerNumber: number | null;
  returnYards: number;
  /** A muffed kick: the returning team lost it, so we keep the ball. */
  fumbled: boolean;
  fumbleLost: boolean;
  notes: string;
}

export interface PuntForm {
  type: 'punt';
  punterNumber: number | null;
  puntYards: number;
  isTouchback: boolean;
  isBlocked: boolean;
  outOfBounds: boolean;
  returnerNumber: number | null;
  returnYards: number;
  isFairCatch: boolean;
  fumbled: boolean;
  fumbleLost: boolean;
  notes: string;
}

export interface FieldGoalForm {
  type: 'field_goal';
  kickerNumber: number | null;
  kickDistance: number;
  result: 'GOOD' | 'MISS' | 'BLOCK';
  notes: string;
}

export interface ExtraPointForm {
  type: 'extra_point';
  attemptType: 'KICK' | '2PT_RUN' | '2PT_PASS';
  result: 'GOOD' | 'MISS';
  kickerNumber: number | null;
  notes: string;
}

export type PlayForm =
  | RunForm
  | PassForm
  | PenaltyForm
  | KickoffForm
  | PuntForm
  | FieldGoalForm
  | ExtraPointForm;

/**
 * The quick-yard chips beside every yardage input. A coach taps one of these
 * far more often than typing, so the set is tuned to real play outcomes
 * rather than being a uniform range (tracker.js:309).
 */
export const QUICK_YARDS = [-10, -5, -2, -1, 0, 1, 2, 3, 4, 5, 7, 10, 15, 20] as const;

/**
 * Which positions each player select offers. `satisfies` makes a typo like
 * 'RB ' a compile error rather than a select that silently renders no
 * options.
 */
export const SELECT_POSITIONS = {
  ballCarrier: ['RB', 'FB', 'QB', 'WR', 'TE'],
  quarterback: ['QB'],
  receiver: ['WR', 'TE', 'RB', 'FB'],
  kicker: ['K'],
  punter: ['P'],
} as const satisfies Record<string, readonly Position[]>;

export interface PlayFormMeta {
  title: string;
  accent: string;
}

/**
 * The accent identifies which form you are on. It colours the heading only --
 * the Save button is `--c-action` on every form, so the commit never moves.
 *
 * These deliberately disagree with `PLAY_KIND_COLOR` in charts/theme.ts,
 * which assigns run=blue and pass=amber. That is a measurement, not a
 * preference: green next to red measures dE 7.4 under deuteranopia, which is
 * inside the floor band for adjacent chart marks. Form headings are never
 * adjacent to each other, so they are free to use the hue that matches the
 * play-type tile you just tapped.
 */
export const PLAY_FORM_META = Object.fromEntries(
  plays.recordable.map((play) => [play.type, { title: play.title, accent: play.accent }]),
) as Record<PlayFormType, PlayFormMeta>;

/** A new form of `type`, before any defaults are applied. */
export function blankForm<T extends PlayFormType>(type: T): Extract<PlayForm, { type: T }> {
  return plays.forType(type).blank();
}

/** A new form of `type`, started from where the ball is -- a field goal knows its distance. */
export function blankFormAt<T extends PlayFormType>(
  type: T,
  cursor: GameCursor,
): Extract<PlayForm, { type: T }> {
  return plays.forType(type).blankAt(GameState.from(cursor));
}

/** Jersey numbers are 0-99, and 0 is a legal number. */
export const JERSEY_MIN = 0;
export const JERSEY_MAX = 99;

export { playerByNumber } from './engine/players';

/**
 * Player numbers carried forward from earlier plays.
 *
 * One quarterback takes most of the snaps and one kicker takes all the
 * kicks, so re-typing them every play is pure friction. The receiver is
 * included because it is asked for, but note it is the one that genuinely
 * changes play to play -- which is why a carried-over value is flagged in
 * the UI rather than filled in silently.
 *
 * The ball carrier is deliberately NOT sticky: it varies as much as the
 * receiver and has no positional reason to repeat.
 */
export interface PlayDefaults {
  quarterbackNumber: number | null;
  receiverNumber: number | null;
  kickerNumber: number | null;
  punterNumber: number | null;
}

export const NO_DEFAULTS: PlayDefaults = {
  quarterbackNumber: null,
  receiverNumber: null,
  kickerNumber: null,
  punterNumber: null,
};

/** Kept per side: the last quarterback we used says nothing about theirs. */
export type DefaultsByTeam = Record<'us' | 'them', PlayDefaults>;

export const emptyDefaults = (): DefaultsByTeam => ({
  us: { ...NO_DEFAULTS },
  them: { ...NO_DEFAULTS },
});

/** Pre-fill a blank form with whoever last filled each role. */
export function applyDefaults<T extends PlayForm>(form: T, defaults: PlayDefaults): T {
  return plays.forForm(form).applyDefaults(form, defaults);
}

/** Fold a just-saved form into the running defaults for that side. */
export function rememberPlayers(defaults: PlayDefaults, form: PlayForm): PlayDefaults {
  return plays.forForm(form).remember(defaults, form);
}

/**
 * What every play form is handed.
 *
 * All seven declared this separately. `T` is the form's own variant, so a
 * component still gets its exact shape rather than the whole union.
 */
export interface PlayFormProps<T extends PlayForm> {
  form: T;
  roster: Player[];
  possession: 'us' | 'them';
  /** Where the play starts, so a form can tell a touchdown from a gain. */
  ballPosition?: number | null;
  playbook: Play[];
  defaults: PlayDefaults;
  busy: boolean;
  onsave: () => void;
  oncancel: () => void;
  /** Kicks from scrimmage only: switch between punt and field goal. */
  onswitch?: (kick: ScrimmageKick) => void;
}

/**
 * Did the play carry the ball into the end zone?
 *
 * The one rule behind both the TD toggle lighting up as the coach types and
 * the play being scored on save, so the two can never disagree. A play that
 * hands the ball over is not the carrier scoring, and only a caught ball can
 * be carried in; see `ScrimmagePlay.scoresTouchdown`.
 */
export function touchdownFromYardage(
  form: PlayForm,
  ballPosition: number | null | undefined,
  possession: Possession,
): boolean {
  return ballPosition != null && plays.forForm(form).scoresTouchdown(form, ballPosition, possession);
}

/** Did the play put the carrier down in his own end zone? The mirror of the above. */
export function safetyFromYardage(
  form: PlayForm,
  ballPosition: number | null | undefined,
  possession: Possession,
): boolean {
  return ballPosition != null && plays.forForm(form).concedesSafety(form, ballPosition, possession);
}

/**
 * Could this snap end in a safety? Only when the offense is backed up near
 * its own goal line -- so the Safety toggle only appears there, rather than
 * cluttering every form for a result that cannot happen from midfield.
 */
export function safetyPossible(ballPosition: number | null | undefined, possession: Possession): boolean {
  return ballPosition != null && yardsToOwnGoalFor(ballPosition, possession) <= 10;
}

export { fieldGoalDistance } from './field';

/** The two kicks from scrimmage, which share one form. */
export type ScrimmageKick = 'punt' | 'field_goal';

/**
 * Which kick to open the combined form on: a field goal once it is within
 * the level's usual range, a punt otherwise. Only the starting choice -- one
 * tap switches it.
 */
export function defaultScrimmageKick(
  ballPosition: number,
  possession: Possession,
  rules: Ruleset = Ruleset.default,
): ScrimmageKick {
  return fieldGoalDistance(ballPosition, possession) <= rules.fieldGoalRange ? 'field_goal' : 'punt';
}

/**
 * Does the yardage entered on a pass say it was caught?
 *
 * Only a caught ball gains ground, so a pass for +7 was completed -- and an
 * incomplete pass stores no yards, which meant forgetting the Complete toggle
 * quietly threw the gain away. Not for a sack, whose loss is entered as a
 * positive number under "Yards lost", nor for an interception, whose yards
 * are not the offense's.
 */
export function gainImpliesCompletion(form: PassForm): boolean {
  return form.yardsGained > 0 && !form.wasSacked && !form.isInterception;
}
