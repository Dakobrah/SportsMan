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

/** Yards to gain for a normal first down. */
export const FIRST_DOWN_DISTANCE = 10;

/**
 * The mirror-image spot.
 *
 * NOT used for changes of possession -- see the Possession section below for
 * why. It remains only for rendering a mirrored field after a halftime swap.
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


// ---------------------------------------------------------------------------
// Possession
//
// The coordinate above is ABSOLUTE: -50 is always the end zone we defend and
// +50 is always the one we attack, for the whole game. Which team is holding
// the ball is tracked separately.
//
// This matters, and it is the fix for a real bug. The original model was
// possession-RELATIVE: a turnover mirrored the ball across midfield, so an
// interception at the opponent's 20 re-read as our own 20 and the ball
// jumped the width of the field on screen. On a real field an interception
// moves nobody -- the other team simply takes over on that spot, running the
// other way. Keeping the frame fixed and flipping `possession` instead is
// what makes the tracker behave like the game.
//
// Teams change ends at halftime, but that is a rendering concern only (see
// `sidesSwapped`); it does not touch a single stored coordinate.
// ---------------------------------------------------------------------------

/** Who has the ball. 'us' is the team this app is keeping book for. */
export type Possession = 'us' | 'them';

export const otherTeam = (team: Possession): Possession => (team === 'us' ? 'them' : 'us');

/**
 * Move the ball `yards` in the direction `team` is driving.
 *
 * We drive toward +50, they drive toward -50, so their gains subtract.
 */
export const advanceBy = (position: number, yards: number, team: Possession): number =>
  clamp(team === 'us' ? position + yards : position - yards);

/** Distance from `position` to the end zone `team` is attacking. */
export const yardsToGoalFor = (position: number, team: Possession): number =>
  team === 'us' ? OPPONENT_GOAL - position : position - OWN_GOAL;

/** Does a gain of `yards` from `position` carry `team` into the end zone? */
export const reachesGoalLine = (position: number, yards: number, team: Possession): boolean =>
  yards >= yardsToGoalFor(position, team);

/** Distance from `position` back to the goal line `team` defends. */
export const yardsToOwnGoalFor = (position: number, team: Possession): number =>
  yardsToGoalFor(position, otherTeam(team));

/**
 * Does a loss of ground from `position` put `team`'s ball carrier down in his
 * own end zone? That is a safety. `yards` is signed, so a loss is negative.
 */
export const reachesOwnGoalLine = (position: number, yards: number, team: Possession): boolean =>
  -yards >= yardsToOwnGoalFor(position, team);

/**
 * How far a penalty actually moves the ball.
 *
 * Half the distance to the goal: a flag that would carry the ball more than
 * halfway to the goal line it is moving toward is enforced as half that
 * distance instead. `room` is the distance to that goal line. Positions are
 * whole yards, so the half is rounded to keep the ball OUT of the end zone --
 * from our 5 a ten-yard flag moves two, to our 3, never to the goal line.
 */
export function enforcedPenaltyYards(yards: number, room: number): number {
  return yards > room / 2 ? Math.floor(room / 2) : yards;
}

/** Ten, unless `team`'s goal line is nearer -- then it is first and goal. */
export const firstDownDistanceFor = (position: number, team: Possession): number =>
  Math.min(FIRST_DOWN_DISTANCE, yardsToGoalFor(position, team));

/** `team`'s own `yard` line, as an absolute position. */
export const yardLineOf = (team: Possession, yard: number): number =>
  team === 'us' ? OWN_GOAL + yard : OPPONENT_GOAL - yard;

/** A kickoff is taken from the kicking team's own 35. */
export const kickoffSpotFor = (kicker: Possession): number => yardLineOf(kicker, 35);

/** A kickoff touchback gives the receiving team their own 25. */
export const kickoffTouchbackSpotFor = (receiver: Possession): number =>
  yardLineOf(receiver, 25);

/** A punt touchback gives the receiving team their own 20. */
export const puntTouchbackSpotFor = (receiver: Possession): number =>
  yardLineOf(receiver, 20);

/** After a safety, the team that conceded it free-kicks from its own 20. */
export const safetyKickSpotFor = (kicker: Possession): number => yardLineOf(kicker, 20);

/** A PAT is snapped from the defending team's 3, i.e. the scorer's opp 3. */
export const extraPointSpotFor = (scorer: Possession): number =>
  yardLineOf(otherTeam(scorer), 3);

/** True when `team` is inside the opponent's 20. */
export const isRedZoneFor = (position: number, team: Possession): boolean =>
  yardsToGoalFor(position, team) <= 20;

// ---------------------------------------------------------------------------
// Rendering geometry
// ---------------------------------------------------------------------------

/**
 * A football field is 120 yards long: 100 of playing surface between two
 * 10-yard end zones. The -50..+50 coordinate covers the PLAYING surface
 * only, so it occupies the middle 100/120 of a drawn field and the end zones
 * sit outside it.
 *
 * Drawing the end zones as overlays on the full width instead puts our goal
 * line around the 10-yard line, which is exactly where the ball then appears
 * to stop.
 */
export const END_ZONE_PCT = 100 / 12;
export const PLAYING_PCT = 100 - END_ZONE_PCT * 2;

/** Where `position` sits across the whole 120-yard graphic, as a percentage. */
export function fieldPercent(position: number, swapped = false): number {
  const along = END_ZONE_PCT + ((position + 50) / 100) * PLAYING_PCT;
  return swapped ? 100 - along : along;
}
