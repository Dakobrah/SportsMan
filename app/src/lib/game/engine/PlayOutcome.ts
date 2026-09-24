/**
 * What happened on a play, in the terms the state machine reads.
 *
 * Built from the stored row, never from the form: the cursor a reload
 * rebuilds must be the same one the live tracker computed, and the only way
 * to guarantee that is for both to read the same thing.
 */
import type { Snap } from '../../db/repositories/types';
import type { PlayData, PlayResult } from './types';

/**
 * How far a snap actually moved the ball.
 *
 * A sack stores its loss in `sackYards` with `yardsGained` left at zero,
 * matching Django's shape and what the passing reports expect. Reading
 * `yardsGained` alone meant a sack moved the ball nowhere and never grew the
 * distance -- replaying a real game showed 1st & 10 after an eight-yard sack
 * where the field said 2nd & 18. This is the one definition.
 */
export function snapYardage(snap: Snap): number {
  if (snap.kind === 'PASS' && snap.wasSacked) return snap.sackYards;
  return snap.yardsGained ?? 0;
}

export class PlayOutcome {
  constructor(
    readonly data: PlayData = {},
    readonly result: PlayResult = {},
  ) {}

  static fromSnap(snap: Snap): PlayOutcome {
    return new PlayOutcome(
      {
        puntYards: snap.puntYards,
        kickYards: snap.kickYards,
        returnYards: snap.returnYards,
        isFairCatch: snap.isFairCatch,
        isTouchback: snap.isTouchback,
        isOnsideKick: snap.isOnsideKick,
        onsideRecovered: snap.onsideRecovered,
        result: snap.result ?? undefined,
        penaltyYards: snap.penaltyYards ?? undefined,
        onOffense: snap.penaltyOnOffense ?? undefined,
        accepted: snap.penaltyAccepted ?? undefined,
        autoFirstDown: snap.penaltyAutoFirstDown,
      },
      {
        yardsGained: snapYardage(snap),
        isTouchdown: snap.isTouchdown,
        isDefensiveTouchdown: snap.isDefensiveTouchdown,
        isSafety: snap.isSafety,
        isFirstDown: snap.isFirstDown,
        isInterception: snap.isInterception,
        fumbleLost: snap.fumbleLost,
      },
    );
  }

  /** Yards the play moved the ball, signed from the offense's side. */
  get yards(): number {
    return this.result.yardsGained ?? 0;
  }

  /** The defense took the ball away during the play. */
  get isTakeaway(): boolean {
    return Boolean(this.result.isInterception || this.result.fumbleLost);
  }
}
