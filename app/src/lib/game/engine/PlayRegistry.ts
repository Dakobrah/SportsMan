/**
 * The one dispatch on play type.
 *
 * Every question of the form "what does a punt do?" is answered by looking
 * the play up here and asking it. Nothing else in the app switches on
 * `form.type` or `snap.kind` to decide behaviour.
 */
import type { SnapKind } from '../../db/repositories/types';
import type { PlayForm } from '../playForm';
import type { PlayDefinition } from './PlayDefinition';
import { ExtraPointPlay } from './plays/ExtraPointPlay';
import { FieldGoalPlay } from './plays/FieldGoalPlay';
import { KickoffPlay } from './plays/KickoffPlay';
import { LegacyDefensePlay } from './plays/LegacyDefensePlay';
import { PassPlay } from './plays/PassPlay';
import { PenaltyPlay } from './plays/PenaltyPlay';
import { PuntPlay } from './plays/PuntPlay';
import { RunPlay } from './plays/RunPlay';
import type { PlayType } from './types';

/** The definition that handles forms of type `T`. */
export type PlayFor<T extends PlayType> = PlayDefinition<Extract<PlayForm, { type: T }>>;

export class PlayRegistry {
  private readonly byType = new Map<PlayType, PlayDefinition>();
  private readonly byKind = new Map<SnapKind, PlayDefinition>();

  /**
   * @param recordable plays a coach can record, in the order they are offered
   * @param legacy     row kinds that must still replay but are never recorded
   */
  constructor(
    readonly recordable: readonly PlayDefinition[],
    legacy: readonly PlayDefinition[] = [],
  ) {
    for (const play of recordable) {
      this.byType.set(play.type, play);
      this.byKind.set(play.kind, play);
    }
    for (const play of legacy) this.byKind.set(play.kind, play);
  }

  forType<T extends PlayType>(type: T): PlayFor<T> {
    const play = this.byType.get(type);
    if (!play) throw new Error(`no play is registered for type '${type}'`);
    return play as unknown as PlayFor<T>;
  }

  forKind(kind: SnapKind): PlayDefinition {
    const play = this.findKind(kind);
    if (!play) throw new Error(`no play is registered for kind '${kind}'`);
    return play;
  }

  /** As `forKind`, but for rows that may predate a kind -- an imported file. */
  findKind(kind: SnapKind): PlayDefinition | undefined {
    return this.byKind.get(kind);
  }

  /** The definition for a form, typed to that form's own variant. */
  forForm<F extends PlayForm>(form: F): PlayDefinition<F> {
    return this.forType(form.type) as unknown as PlayDefinition<F>;
  }
}

export const plays = new PlayRegistry(
  [
    new RunPlay(),
    new PassPlay(),
    new PenaltyPlay(),
    new KickoffPlay(),
    new PuntPlay(),
    new FieldGoalPlay(),
    new ExtraPointPlay(),
  ],
  [new LegacyDefensePlay()],
);
