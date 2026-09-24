/**
 * Turning jersey numbers into players.
 *
 * A leaf. `playerByNumber`, `playerLookup` and the '#22 Danforth' tag were
 * spread across playForm.ts and summary.ts; the three resolution rules were
 * closures inside `toSnapRow`, with the returner rule written out twice.
 */
import type { Player } from '../../db/repositories/types';
import type { Possession } from '../field';

export type PlayerLookup = ReadonlyMap<number, Player>;

/** Index a roster by player id, for rendering summaries. */
export const playerLookup = (players: Player[]): PlayerLookup =>
  new Map(players.map((player) => [player.id, player]));

/**
 * Find the roster player wearing `number`.
 *
 * Only meaningful for our own plays. The opponent's #22 has nothing to do
 * with ours, so callers must not resolve against this roster when the other
 * team has the ball -- see `RosterLinks.offense`.
 */
export const playerByNumber = (
  number: number | null,
  roster: Player[],
): Player | undefined =>
  number == null ? undefined : roster.find((player) => player.number === number);

/**
 * '#22 Danforth' for one of ours, '#22' for anyone else.
 *
 * The bare number is the normal case for the opponent's offence, which has
 * no roster here, so it must read as a real answer rather than a failure.
 */
export function playerTag(id: number | null, number: number | null, players: PlayerLookup): string {
  if (id !== null) {
    const player = players.get(id);
    if (player) return `#${player.number} ${player.lastName}`;
  }
  if (number !== null) return `#${number}`;
  return 'Unknown';
}

/**
 * Which jersey numbers become links to our roster, for one play.
 *
 * The app keeps one team's roster but records both teams' plays, so the same
 * number means different people depending on who is on the field. Each rule
 * below answers "is this one of ours?" for a different role.
 */
export class RosterLinks {
  constructor(
    private readonly roster: Player[],
    /** Who had the ball when the play was snapped. */
    private readonly possession: Possession,
  ) {}

  /**
   * A player on the team with the ball -- carrier, passer, kicker. Ours only
   * when we have it: their #22 is a different person from ours, so resolving
   * an opponent's number here would credit their carries to our back.
   */
  offense(number: number | null): number | null {
    return this.possession === 'us' ? this.ours(number) : null;
  }

  /**
   * One of our players whatever the possession. A defender making the stop
   * on their drive is still one of ours.
   */
  ours(number: number | null): number | null {
    return playerByNumber(number, this.roster)?.id ?? null;
  }

  /**
   * The player fielding a kick belongs to the RECEIVING team -- the side
   * that does not have possession on the kick -- so this is `offense`
   * inverted.
   */
  returner(number: number | null): number | null {
    return this.possession === 'us' ? null : this.ours(number);
  }
}
