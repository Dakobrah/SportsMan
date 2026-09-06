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
import type { Player, Position } from '../db/repositories/types';

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
  quarterbackNumber: number | null;
  receiverNumber: number | null;
  isComplete: boolean;
  wasSacked: boolean;
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

export const PLAY_FORM_META: Record<PlayFormType, PlayFormMeta> = {
  run: { title: 'Run Play', accent: 'var(--t-green)' },
  pass: { title: 'Pass Play', accent: 'var(--t-blue)' },
  penalty: { title: 'Penalty', accent: 'var(--t-amber)' },
  kickoff: { title: 'Kickoff', accent: 'var(--t-purple)' },
  punt: { title: 'Punt', accent: 'var(--t-purple)' },
  field_goal: { title: 'Field Goal', accent: 'var(--t-purple)' },
  extra_point: { title: 'Extra Point / 2-Point', accent: 'var(--t-purple)' },
};

/** No defender recorded. */
const noDefense = (): DefensiveDetail => ({
  tacklerNumber: null,
  assistNumbers: [],
  tackleForLoss: false,
  appliedPressure: false,
  forcedIncompletion: false,
  isDefensiveTouchdown: false,
});

/** Defaults that used to live inside the HTML-string builders. */
export function blankForm<T extends PlayFormType>(type: T): Extract<PlayForm, { type: T }> {
  switch (type) {
    case 'run':
      return {
        ...noDefense(),
        type: 'run', ballCarrierNumber: null, yardsGained: 0,
        isTouchdown: false, isFirstDown: false, fumbled: false, fumbleLost: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'pass':
      return {
        ...noDefense(),
        type: 'pass', quarterbackNumber: null, receiverNumber: null,
        isComplete: false, wasSacked: false, yardsGained: 0,
        isTouchdown: false, isFirstDown: false, isInterception: false,
        fumbled: false, fumbleLost: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'penalty':
      return {
        type: 'penalty', penaltyName: '', penaltyYards: 5,
        onOffense: true, accepted: true, autoFirstDown: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'kickoff':
      return {
        type: 'kickoff', kickerNumber: null, kickYards: 60,
        isTouchback: false, isOnsideKick: false, outOfBounds: false,
        // 60 yards from the 35 comes down on their 5; a 20-yard return puts
        // them on their 25, which is where the flat default used to land.
        returnerNumber: null, returnYards: 20,
        fumbled: false, fumbleLost: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'punt':
      return {
        type: 'punt', punterNumber: null, puntYards: 40,
        isTouchback: false, isBlocked: false, outOfBounds: false,
        returnerNumber: null, returnYards: 0, isFairCatch: false,
        fumbled: false, fumbleLost: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'field_goal':
      return {
        type: 'field_goal', kickerNumber: null, kickDistance: 30, result: 'GOOD', notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'extra_point':
      return {
        type: 'extra_point', attemptType: 'KICK', result: 'GOOD', kickerNumber: null, notes: '',
      } as Extract<PlayForm, { type: T }>;
    default: {
      const exhaustive: never = type;
      throw new Error(`unknown play form: ${String(exhaustive)}`);
    }
  }
}

/** Jersey numbers are 0-99, and 0 is a legal number. */
export const JERSEY_MIN = 0;
export const JERSEY_MAX = 99;

/**
 * Find the roster player wearing `number`.
 *
 * Only meaningful for our own plays. The opponent's #22 has nothing to do
 * with ours, so callers must not resolve against this roster when the other
 * team has the ball -- see toSnapRow.
 */
export const playerByNumber = (
  number: number | null,
  roster: Player[],
): Player | undefined =>
  number == null ? undefined : roster.find((player) => player.number === number);

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
  switch (form.type) {
    case 'pass':
      return {
        ...form,
        quarterbackNumber: defaults.quarterbackNumber,
        receiverNumber: defaults.receiverNumber,
      };
    case 'kickoff':
    case 'field_goal':
    case 'extra_point':
      return { ...form, kickerNumber: defaults.kickerNumber };
    case 'punt':
      return { ...form, punterNumber: defaults.punterNumber };
    default:
      return form;
  }
}

/** Fold a just-saved form into the running defaults for that side. */
export function rememberPlayers(defaults: PlayDefaults, form: PlayForm): PlayDefaults {
  switch (form.type) {
    case 'pass':
      return {
        ...defaults,
        quarterbackNumber: form.quarterbackNumber ?? defaults.quarterbackNumber,
        receiverNumber: form.receiverNumber ?? defaults.receiverNumber,
      };
    case 'kickoff':
    case 'field_goal':
    case 'extra_point':
      return { ...defaults, kickerNumber: form.kickerNumber ?? defaults.kickerNumber };
    case 'punt':
      return { ...defaults, punterNumber: form.punterNumber ?? defaults.punterNumber };
    default:
      return defaults;
  }
}
