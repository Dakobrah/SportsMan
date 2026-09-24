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
import { plays } from './engine/PlayRegistry';
import { reachesGoalLine } from './field';

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

export interface RunForm extends DefensiveDetail {
  type: 'run';
  /** The call. `formation` is stored alongside so a game survives a
   *  playbook edit -- the same reasoning as the jersey numbers. */
  playId: number | null;
  formation: string;
  /** The jersey number the coach typed. Resolved to a roster player only
   *  when we have the ball -- their #22 is not our #22. */
  ballCarrierNumber: number | null;
  yardsGained: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  fumbled: boolean;
  fumbleLost: boolean;
  notes: string;
}

export interface PassForm extends DefensiveDetail {
  type: 'pass';
  playId: number | null;
  formation: string;
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
  yardsGained: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  isInterception: boolean;
  fumbled: boolean;
  fumbleLost: boolean;
  notes: string;
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
}

/**
 * Did the play carry the ball into the end zone?
 *
 * The one rule behind both the TD toggle lighting up as the coach types and
 * `withGoalLineTouchdown` scoring the play on save. Breaking the plane is not
 * a judgement call, so the two must never disagree about it -- hence one
 * predicate rather than a copy on each side.
 *
 * A play that hands the ball over is not the carrier scoring: a lost fumble
 * or an interception is the other team's return, and a defensive touchdown
 * is already six points for the other side. Only a caught ball can be
 * carried in, and a sack never gains ground.
 */
export function touchdownFromYardage(
  form: PlayForm,
  ballPosition: number | null | undefined,
  possession: Possession,
): boolean {
  if (form.type !== 'run' && form.type !== 'pass') return false;
  if (ballPosition == null) return false;
  if (form.fumbleLost || form.isDefensiveTouchdown) return false;
  if (form.type === 'pass' && (!form.isComplete || form.isInterception || form.wasSacked)) {
    return false;
  }
  return reachesGoalLine(ballPosition, form.yardsGained, possession);
}
