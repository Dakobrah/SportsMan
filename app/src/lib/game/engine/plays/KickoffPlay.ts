import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import { type Possession, kickoffSpotFor, kickoffTouchbackSpotFor, safetyKickSpotFor } from '../../field';
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
      onsideRecovered: false,
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

  /** A free kick after a safety is from the kicker's 20; every other kickoff from the 35. */
  private static spot(kicker: Possession, afterSafety: boolean): number {
    return afterSafety ? safetyKickSpotFor(kicker) : kickoffSpotFor(kicker);
  }

  /**
   * Reading a stored row: the 20 is written only for a safety kick, so the
   * row's spot says which it was. Anything else -- Django's legacy `35`,
   * which meant the opponent's 15, included -- is an ordinary kickoff.
   */
  protected kickedFrom(state: GameState): number {
    return KickoffPlay.spot(state.offense, state.ballPosition === safetyKickSpotFor(state.offense));
  }

  protected kickLength(outcome: PlayOutcome): number {
    return outcome.data.kickYards ?? 0;
  }

  protected advance(state: GameState, outcome: PlayOutcome): GameState {
    const receiver = state.defense;
    if (outcome.data.isOnsideKick && outcome.data.onsideRecovered) {
      // The kicking team came up with it: their ball, first and ten, where
      // they recovered. Not a muff -- the receiving team never had it.
      return state.firstAndTen(this.fieldedSpot(state, outcome), state.offense);
    }
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
      // A dead-ball snap: from the 20 when the cursor is waiting on a safety
      // kick, otherwise the 35 -- including a kickoff tapped from a normal
      // down, such as the opening kick.
      down: null,
      distance: null,
      ballPosition: KickoffPlay.spot(
        state.possession,
        state.situation === 'kickoff' && state.ballPosition === safetyKickSpotFor(state.possession),
      ),
      kickerNumber: form.kickerNumber,
      kickerId: links.offense(form.kickerNumber),
      kickYards: form.kickYards,
      isTouchback: form.isTouchback,
      isOnsideKick: form.isOnsideKick,
      onsideRecovered: form.isOnsideKick && form.onsideRecovered,
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
