/**
 * Row and domain types, and the one place the two representations are
 * bridged.
 *
 * SQLite has no boolean type, so the schema stores 0/1 INTEGERs, and every
 * column is snake_case. The rest of the app wants `boolean` and camelCase.
 * Doing that conversion here — once, driven by a declared set of boolean
 * columns per table — keeps `row.is_touchdown === 1` out of every call site.
 *
 * Note that the backup document (lib/backup/) deliberately does *not* use
 * these types: it stores raw rows, because it is a database dump rather than
 * an API and should change when the schema does.
 */

export type Position =
  | 'QB' | 'RB' | 'FB' | 'WR' | 'TE' | 'OL'
  | 'DL' | 'LB' | 'CB' | 'S'
  | 'K'  | 'P'  | 'LS';

/** Ordered for display: offense, then defense, then special teams. */
export const POSITIONS: readonly Position[] = [
  'QB', 'RB', 'FB', 'WR', 'TE', 'OL',
  'DL', 'LB', 'CB', 'S',
  'K', 'P', 'LS',
] as const;

/** Who has the ball. Re-exported from the coordinate authority. */
export type { Possession } from '../../game/field';

export type Location = 'home' | 'away' | 'neutral';
export type Weather = 'clear' | 'rainy' | 'snowy' | 'windy' | 'hot' | 'cold';
export type FieldCondition = 'turf' | 'grass' | 'wet';

export type SnapKind =
  | 'RUN' | 'PASS' | 'DEFENSE' | 'PUNT'
  | 'KICKOFF' | 'FG' | 'XP' | 'PENALTY';

export type DefenseResult = 'TACKLE' | 'TFL' | 'SACK' | 'INT' | 'FREC' | 'PD' | 'PENALTY';
export type KickResult = 'GOOD' | 'MISS' | 'BLOCK' | 'FAIL';
export type AttemptType = 'KICK' | '2PT_RUN' | '2PT_PASS';
export type AssistType = 'TACKLE' | 'SACK' | 'COV';
export type UnitType = 'OFF' | 'DEF' | 'ST';

/** Mirrors the `Situation` union in lib/game/nextState.ts. */
export type Situation =
  | 'normal' | 'extra_point' | 'kickoff'
  | 'turnover' | 'turnover_on_downs' | 'opponent_ball';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Team {
  id: number;
  name: string;
  abbreviation: string;
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: number;
  year: number;
  teamId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: number;
  teamId: number;
  firstName: string;
  lastName: string;
  position: Position;
  number: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  id: number;
  seasonId: number;
  date: string;
  opponent: string;
  location: Location;
  weather: Weather;
  fieldCondition: FieldCondition;
  teamScore: number;
  opponentScore: number;
  notes: string;
  currentQuarter: number;
  currentDown: number | null;
  currentDistance: number | null;
  currentBallPosition: number;
  currentSituation: Situation;
  currentPossession: 'us' | 'them';
  /** Presentation only: mirrors how the field is drawn after halftime. */
  sidesSwapped: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuarterScore {
  id: number;
  gameId: number;
  quarter: number;
  teamScore: number;
  opponentScore: number;
}

export interface Play {
  id: number;
  name: string;
  unitType: UnitType;
  description: string;
}

export interface DefenseAssist {
  id: number;
  snapId: number;
  playerId: number;
  assistType: AssistType;
}

/** Every column of `snaps`, in schema order. Kind-specific fields are null
 *  when they do not apply — interpret them against `kind`. */
export interface Snap {
  id: number;
  gameId: number;
  kind: SnapKind;

  sequenceNumber: number;
  quarter: number;
  /** Which side ran the play. */
  possession: 'us' | 'them';
  gameClockSeconds: number | null;
  down: number | null;
  distance: number | null;
  ballPosition: number | null;
  formation: string;
  playId: number | null;
  notes: string;

  yardsGained: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  fumbled: boolean;
  fumbleLost: boolean;
  fumbleRecoveredById: number | null;

  ballCarrierId: number | null;
  ballCarrierNumber: number | null;

  quarterbackId: number | null;
  quarterbackNumber: number | null;
  targetId: number | null;
  receiverId: number | null;
  receiverNumber: number | null;
  isComplete: boolean;
  airYards: number;
  yardsAfterCatch: number;
  isInterception: boolean;
  isThrownAway: boolean;
  wasUnderPressure: boolean;
  wasSacked: boolean;
  sackYards: number;

  defenseResult: DefenseResult | null;
  secondaryFormation: string;
  primaryPlayerId: number | null;
  primaryPlayerNumber: number | null;
  tackleYards: number | null;
  tackleForLoss: boolean;
  appliedPressure: boolean;
  forcedIncompletion: boolean;
  interceptionReturnYards: number | null;
  fumbleReturnYards: number | null;
  isDefensiveTouchdown: boolean;

  kickerId: number | null;
  kickerNumber: number | null;
  holderId: number | null;
  result: KickResult | null;
  isTouchback: boolean;
  outOfBounds: boolean;

  punterId: number | null;
  punterNumber: number | null;
  puntYards: number;
  hangTimeSeconds: number | null;
  isBlocked: boolean;
  downedAtYardLine: number | null;

  kickYards: number;
  isOnsideKick: boolean;
  onsideRecovered: boolean;

  kickDistance: number | null;

  attemptType: AttemptType | null;
  passerId: number | null;

  hadPenalty: boolean;
  penaltyPlayerId: number | null;
  penaltyYards: number | null;
  penaltyDescription: string;
  /** Null when unknown — imported Django rows never recorded these. */
  penaltyOnOffense: boolean | null;
  penaltyAccepted: boolean | null;

  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Row <-> domain
// ---------------------------------------------------------------------------

/** Boolean columns, by table. Anything listed here is 0/1 in SQLite. */
export const BOOLEAN_COLUMNS = {
  players: new Set(['is_active']),
  games: new Set(['sides_swapped']),
  snaps: new Set([
    'is_touchdown', 'is_first_down', 'fumbled', 'fumble_lost',
    'is_complete', 'is_interception', 'is_thrown_away',
    'was_under_pressure', 'was_sacked',
    'tackle_for_loss', 'applied_pressure', 'forced_incompletion',
    'is_defensive_touchdown',
    'is_touchback', 'out_of_bounds', 'is_blocked',
    'is_onside_kick', 'onside_recovered',
    'had_penalty', 'penalty_on_offense', 'penalty_accepted',
  ]),
} as const;

const NO_BOOLEANS: ReadonlySet<string> = new Set();

const camelCache = new Map<string, string>();

/** `ball_carrier_id` -> `ballCarrierId`. Memoised; the same few dozen column
 *  names are converted on every row of every query. */
export function camel(key: string): string {
  const hit = camelCache.get(key);
  if (hit !== undefined) return hit;
  const out = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  camelCache.set(key, out);
  return out;
}

/**
 * Convert one SQLite row to its domain shape.
 *
 * Booleans stay null when the column is null: `penalty_accepted` is
 * genuinely three-valued (accepted, declined, or never recorded by the
 * Django rows an import brings across), and collapsing null to false would
 * silently claim every imported penalty was declined.
 */
export function toDomain<T>(
  row: Record<string, unknown>,
  booleans: ReadonlySet<string> = NO_BOOLEANS,
): T {
  const out: Record<string, unknown> = {};
  for (const key in row) {
    const value = row[key];
    out[camel(key)] = booleans.has(key) ? (value == null ? null : value === 1) : value;
  }
  return out as T;
}

export const toDomainAll = <T>(
  rows: Record<string, unknown>[],
  booleans: ReadonlySet<string> = NO_BOOLEANS,
): T[] => rows.map((row) => toDomain<T>(row, booleans));

/** SQLite wants 0/1, and `undefined` is not a bindable parameter. */
export const bool = (value: boolean | null | undefined): number | null =>
  value == null ? null : value ? 1 : 0;

/** Booleans that are NOT NULL in the schema, so must not become null. */
export const flag = (value: boolean | undefined): number => (value ? 1 : 0);

const snakeCache = new Map<string, string>();

/** `ballCarrierId` -> `ball_carrier_id`. The inverse of `camel`. */
export function snake(key: string): string {
  const hit = snakeCache.get(key);
  if (hit !== undefined) return hit;
  const out = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  snakeCache.set(key, out);
  return out;
}
