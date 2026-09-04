/**
 * One line describing what happened on a play.
 *
 * The single renderer, which is the point. Django had two: JavaScript built
 * summaries for plays added during the session while Python built different
 * ones for the reloaded feed, so a reload turned the history into
 * "Play #96" noise — a duplication its own docstring documented
 * (apps/frontend/tracker.py:288-292). This one is used by the live feed, the
 * reload path and the play-by-play screen alike.
 */
import type { Player, Snap } from '../db/repositories/types';

export type PlayerLookup = ReadonlyMap<number, Player>;

/** '#22 Danforth', or 'Unknown' when nobody was attached to the play. */
function tag(id: number | null, players: PlayerLookup): string {
  if (id === null) return 'Unknown';
  const player = players.get(id);
  return player ? `#${player.number} ${player.lastName}` : 'Unknown';
}

export function summarize(snap: Snap, players: PlayerLookup): string {
  switch (snap.kind) {
    case 'RUN':
      return `${tag(snap.ballCarrierId, players)} run for ${snap.yardsGained} yds`;

    case 'PASS': {
      const passer = tag(snap.quarterbackId, players);
      if (snap.wasSacked) return `${passer} sacked for ${snap.sackYards} yds`;
      if (snap.isInterception) return `${passer} INTERCEPTED`;
      if (snap.isComplete) {
        const to = snap.receiverId !== null ? ` to ${tag(snap.receiverId, players)}` : '';
        return `${passer}${to} for ${snap.yardsGained} yds`;
      }
      return `${passer} pass incomplete`;
    }

    case 'FG':
      return `FG ${snap.result} (${snap.kickDistance} yds)`;

    case 'XP':
      return `${snap.attemptType === 'KICK' ? 'PAT' : '2PT'} ${snap.result}`;

    case 'KICKOFF':
      return `Kickoff ${snap.kickYards} yds${snap.isTouchback ? ' (TB)' : ''}`;

    case 'PUNT':
      if (snap.isBlocked) return 'BLOCKED punt';
      return `Punt ${snap.puntYards} yds${snap.isTouchback ? ' (TB)' : ''}`;

    case 'PENALTY':
      return `PENALTY: ${snap.penaltyDescription || (snap.penaltyOnOffense ? 'on offense' : 'on defense')}`;

    case 'DEFENSE':
      if (snap.defenseResult === 'PENALTY') {
        return `PENALTY: ${snap.penaltyDescription || 'on defense'}`;
      }
      return `${tag(snap.primaryPlayerId, players)} ${snap.defenseResult ?? 'play'}`;

    default:
      return `Play #${snap.sequenceNumber}`;
  }
}

/** Yards gained on a snap, for the feed's emphasis styling. */
export function snapYardage(snap: Snap): number {
  if (snap.kind === 'PASS' && snap.wasSacked) return snap.sackYards;
  return snap.yardsGained ?? 0;
}

/** Convenience for callers that hold a roster array. */
export const playerLookup = (players: Player[]): PlayerLookup =>
  new Map(players.map((player) => [player.id, player]));
