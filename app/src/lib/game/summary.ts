/**
 * One line describing what happened on a play.
 *
 * The single renderer, which is the point. Django had two: JavaScript built
 * summaries for plays added during the session while Python built different
 * ones for the reloaded feed, so a reload turned the history into
 * "Play #96" noise -- a duplication its own docstring documented
 * (apps/frontend/tracker.py:288-292). This one is used by the live feed, the
 * reload path and the play-by-play screen alike; each play class writes its
 * own line.
 */
import type { Snap } from '../db/repositories/types';
import { plays } from './engine/PlayRegistry';
import type { PlayerLookup } from './engine/players';

export { snapYardage } from './engine/PlayOutcome';
export { playerLookup, type PlayerLookup } from './engine/players';

export function summarize(snap: Snap, players: PlayerLookup): string {
  // A row whose kind nothing handles -- an import from a newer schema, say --
  // still gets a line rather than taking the whole feed down with it.
  return plays.findKind(snap.kind)?.summarize(snap, players) ?? `Play #${snap.sequenceNumber}`;
}
