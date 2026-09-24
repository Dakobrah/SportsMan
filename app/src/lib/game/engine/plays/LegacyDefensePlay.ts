import type { Snap, SnapKind } from '../../../db/repositories/types';
import { type PlayerLookup, playerTag } from '../players';
import { RunPlay } from './RunPlay';

/**
 * A `DEFENSE` row: Django recorded a defensive stop as its own snap. Nothing
 * writes these any more -- the defense rides on the opponent's run or pass
 * row now -- but imported and pre-port games still hold them, so they must
 * replay and render.
 *
 * From our side it was a scrimmage down, so it advances like a run. It has
 * no form and is never offered as something to record.
 */
export class LegacyDefensePlay extends RunPlay {
  readonly kind: SnapKind = 'DEFENSE';

  summarize(snap: Snap, players: PlayerLookup): string {
    if (snap.defenseResult === 'PENALTY') {
      return `PENALTY: ${snap.penaltyDescription || 'on defense'}`;
    }
    return `${playerTag(snap.primaryPlayerId, null, players)} ${snap.defenseResult ?? 'play'}`;
  }

  /** Django never scored these rows. */
  points(): number {
    return 0;
  }
}
