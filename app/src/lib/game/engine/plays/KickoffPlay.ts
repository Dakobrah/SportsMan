import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import { kickoffSpotFor, kickoffTouchbackSpotFor } from '../../field';
import type { KickoffForm, PlayDefaults } from '../../playForm';
import type { GameState } from '../GameState';
import { type JerseyField } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';
import type { RosterLinks } from '../players';
import { checkNumber } from '../validation';
import { KickPlay } from './KickPlay';

export class KickoffPlay extends KickPlay<KickoffForm> {
  readonly type = 'kickoff';
  readonly kind: SnapKind = 'KICKOFF';
  readonly title = 'Kickoff';
  readonly accent = 'var(--t-purple)';

  blank(): KickoffForm {
    return {
      type: 'kickoff',
      kickerNumber: null,
      kickYards: 60,
      isTouchback: false,
      isOnsideKick: false,
      outOfBounds: false,
      // 60 yards from the 35 comes down on their 5; a 20-yard return puts
      // them on their 25, which is where the flat default used to land.
      returnerNumber: null,
      returnYards: 20,
      fumbled: false,
      fumbleLost: false,
      notes: '',
    };
  }

  /** From the kicking team's own 35, whatever the cursor happened to say. */
  protected kickedFrom(state: GameState): number {
    return kickoffSpotFor(state.offense);
  }

  protected kickLength(outcome: PlayOutcome): number {
    return outcome.data.kickYards ?? 0;
  }

  protected advance(state: GameState, outcome: PlayOutcome): GameState {
    const receiver = state.defense;
    // Without a kick distance there is no landing spot to compute, so a
    // missing one falls back to the touchback -- the answer this gave before
    // returns existed.
    if (outcome.data.isTouchback || !outcome.data.kickYards) {
      return state.firstAndTen(kickoffTouchbackSpotFor(receiver), receiver);
    }
    return state.firstAndTen(this.returnedSpot(state, outcome, receiver), receiver);
  }

  protected body(form: KickoffForm, state: GameState, links: RosterLinks): Partial<NewSnap> {
    return {
      // A kickoff is a dead-ball snap from the kicking team's 35.
      down: null,
      distance: null,
      ballPosition: kickoffSpotFor(state.possession),
      kickerNumber: form.kickerNumber,
      kickerId: links.offense(form.kickerNumber),
      kickYards: form.kickYards,
      isTouchback: form.isTouchback,
      isOnsideKick: form.isOnsideKick,
      outOfBounds: form.outOfBounds,
      returnerNumber: form.returnerNumber,
      returnerId: links.returner(form.returnerNumber),
      returnYards: form.returnYards,
      fumbled: form.fumbled,
      fumbleLost: form.fumbleLost,
    };
  }

  summarize(snap: Snap): string {
    return `Kickoff ${snap.kickYards} yds${snap.isTouchback ? ' (TB)' : ''}`;
  }

  validate(form: KickoffForm): void {
    checkNumber('kickYards', form.kickYards);
  }

  jerseyFields(form: KickoffForm): JerseyField[] {
    return [['kickerNumber', form.kickerNumber]];
  }

  applyDefaults(form: KickoffForm, defaults: PlayDefaults): KickoffForm {
    return { ...form, kickerNumber: defaults.kickerNumber };
  }

  remember(defaults: PlayDefaults, form: KickoffForm): PlayDefaults {
    return { ...defaults, kickerNumber: form.kickerNumber ?? defaults.kickerNumber };
  }
}
