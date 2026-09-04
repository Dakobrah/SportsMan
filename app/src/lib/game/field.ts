/**
 * Field position — the single authority on what a yard line means.
 *
 * One convention, defined once: positions run -50..+50 from OUR offense's
 * point of view. -50 is our own goal line, 0 is midfield, +50 is the
 * opponent's goal line. Every landmark below is derived from that, so no
 * bare yard-line number appears anywhere else in the codebase.
 *
 * The Django original spread this across four places that did not agree:
 * two copies of the display helper, a set of simulation constants, and a
 * state machine that hardcoded `35` for a kickoff — which in this convention
 * is the opponent's 15, not our own 35. See `nextState.ts`.
 */

export const OWN_GOAL = -50;
export const MIDFIELD = 0;
export const OPPONENT_GOAL = 50;

/** Inside the opponent's 20. */
export const RED_ZONE = 30;
/** Inside the opponent's 10. */
export const GOAL_TO_GO = 40;

/** Our own N-yard line. `ownYardLine(25)` is our 25. */
export function ownYardLine(yards: number): number {
  return OWN_GOAL + yards;
}

/** The opponent's N-yard line. `opponentYardLine(20)` is their 20. */
export function opponentYardLine(yards: number): number {
  return OPPONENT_GOAL - yards;
}

/** Keep a position on the field. */
export function clamp(position: number): number {
  return Math.max(OWN_GOAL, Math.min(OPPONENT_GOAL, position));
}

/** Yards from `position` to the opponent's goal line. */
export function yardsToGoal(position: number): number {
  return OPPONENT_GOAL - position;
}

/**
 * Yards needed for a first down from `position`.
 *
 * Ten, unless the goal line is nearer: inside the opponent's 10 it is first
 * and goal. Replaying a real game caught the Django original promising ten
 * yards from the opponent's 7 -- "1st & 10" when only 7 yards exist.
 */
export function firstDownDistance(position: number): number {
  return Math.min(FIRST_DOWN_DISTANCE, yardsToGoal(position));
}

/** Yards to gain for a normal first down. */
export const FIRST_DOWN_DISTANCE = 10;

/**
 * The same spot of turf, seen by the other team.
 *
 * Used on a change of possession: our +30 (their 20) becomes their -30.
 */
export function flip(position: number): number {
  // `0 - position` rather than `-position`: negating zero yields -0, which
  // compares unequal to 0 under Object.is and reads as "-0" in a debugger.
  return 0 - position;
}

export function isRedZone(position: number): boolean {
  return position >= RED_ZONE;
}

export function isGoalToGo(position: number): boolean {
  return position >= GOAL_TO_GO;
}

/** "OWN 25" / "OPP 40" / "50" — what a coach reads on the scoreboard. */
export function toDisplay(position: number | null | undefined): string {
  if (position == null) return '—';
  if (position === MIDFIELD) return '50';
  if (position < MIDFIELD) return `OWN ${position - OWN_GOAL}`;
  return `OPP ${OPPONENT_GOAL - position}`;
}

// Derived spots. Declared after the helpers that compute them so the file
// reads top-to-bottom without relying on hoisting.

/** A kickoff is taken from our own 35. */
export const KICKOFF_SPOT = ownYardLine(35);
/** A kickoff touchback gives the receiving team their own 25. */
export const KICKOFF_TOUCHBACK_SPOT = ownYardLine(25);
/** A punt touchback gives the receiving team their own 20. */
export const PUNT_TOUCHBACK_SPOT = ownYardLine(20);
/** A PAT is snapped from the opponent's 3. */
export const EXTRA_POINT_SPOT = opponentYardLine(3);
