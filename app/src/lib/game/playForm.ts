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
import type { Position } from '../db/repositories/types';

export type PlayFormType =
  | 'run'
  | 'pass'
  | 'penalty'
  | 'kickoff'
  | 'punt'
  | 'field_goal'
  | 'extra_point';

export interface RunForm {
  type: 'run';
  ballCarrierId: number | null;
  yardsGained: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  fumbled: boolean;
  fumbleLost: boolean;
  notes: string;
}

export interface PassForm {
  type: 'pass';
  quarterbackId: number | null;
  receiverId: number | null;
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
  kickerId: number | null;
  kickYards: number;
  isTouchback: boolean;
  isOnsideKick: boolean;
  outOfBounds: boolean;
  notes: string;
}

export interface PuntForm {
  type: 'punt';
  punterId: number | null;
  puntYards: number;
  isTouchback: boolean;
  isBlocked: boolean;
  outOfBounds: boolean;
  notes: string;
}

export interface FieldGoalForm {
  type: 'field_goal';
  kickerId: number | null;
  kickDistance: number;
  result: 'GOOD' | 'MISS' | 'BLOCK';
  notes: string;
}

export interface ExtraPointForm {
  type: 'extra_point';
  attemptType: 'KICK' | '2PT_RUN' | '2PT_PASS';
  result: 'GOOD' | 'MISS';
  kickerId: number | null;
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

/** Defaults that used to live inside the HTML-string builders. */
export function blankForm<T extends PlayFormType>(type: T): Extract<PlayForm, { type: T }> {
  switch (type) {
    case 'run':
      return {
        type: 'run', ballCarrierId: null, yardsGained: 0,
        isTouchdown: false, isFirstDown: false, fumbled: false, fumbleLost: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'pass':
      return {
        type: 'pass', quarterbackId: null, receiverId: null,
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
        type: 'kickoff', kickerId: null, kickYards: 60,
        isTouchback: false, isOnsideKick: false, outOfBounds: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'punt':
      return {
        type: 'punt', punterId: null, puntYards: 40,
        isTouchback: false, isBlocked: false, outOfBounds: false, notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'field_goal':
      return {
        type: 'field_goal', kickerId: null, kickDistance: 30, result: 'GOOD', notes: '',
      } as Extract<PlayForm, { type: T }>;
    case 'extra_point':
      return {
        type: 'extra_point', attemptType: 'KICK', result: 'GOOD', kickerId: null, notes: '',
      } as Extract<PlayForm, { type: T }>;
    default: {
      const exhaustive: never = type;
      throw new Error(`unknown play form: ${String(exhaustive)}`);
    }
  }
}
