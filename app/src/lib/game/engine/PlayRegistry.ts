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
import { Ruleset, type RulesetId } from './Ruleset';
import type { PlayType } from './types';

/** The definition that handles forms of type `T`. */
export type PlayFor<T extends PlayType> = PlayDefinition<Extract<PlayForm, { type: T }>>;

export class PlayRegistry {
  /** One registry per level of play; the plays are stateless, so they are shared. */
  private static readonly byRules = new Map<RulesetId, PlayRegistry>();

  /** The plays as `rules` has them. */
  static for(rules: Ruleset = Ruleset.default): PlayRegistry {
    let registry = PlayRegistry.byRules.get(rules.id);
    if (!registry) {
      registry = new PlayRegistry(rules);
      PlayRegistry.byRules.set(rules.id, registry);
    }
    return registry;
  }

  /** Plays a coach can record, in the order they are offered. */
  readonly recordable: readonly PlayDefinition[];
  private readonly byType = new Map<PlayType, PlayDefinition>();
  private readonly byKind = new Map<SnapKind, PlayDefinition>();

  private constructor(readonly rules: Ruleset) {
    this.recordable = [
      new RunPlay(rules),
      new PassPlay(rules),
      new PenaltyPlay(rules),
      new KickoffPlay(rules),
      new PuntPlay(rules),
      new FieldGoalPlay(rules),
      new ExtraPointPlay(rules),
    ];
    for (const play of this.recordable) {
      this.byType.set(play.type, play);
      this.byKind.set(play.kind, play);
    }
    // Row kinds that must still replay but are never recorded.
    const legacy = new LegacyDefensePlay(rules);
    this.byKind.set(legacy.kind, legacy);
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

/**
 * The plays under the default rules. For callers with no season in hand --
 * the yardage predicates the forms light their toggles with, which are
 * geometry and the same at every level.
 */
export const plays = PlayRegistry.for(Ruleset.default);
