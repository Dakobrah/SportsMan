import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import type { PlayDefaults, PuntForm } from '../../playForm';
import type { GameState } from '../GameState';
import { type JerseyField } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';
import type { RosterLinks } from '../players';
import { checkNumber } from '../validation';
import { KickPlay } from './KickPlay';

export class PuntPlay extends KickPlay<PuntForm> {
  readonly type = 'punt';
  readonly kind: SnapKind = 'PUNT';
  readonly title = 'Punt';
  readonly accent = 'var(--t-purple)';

  blank(): PuntForm {
    return {
      type: 'punt',
      punterNumber: null,
      puntYards: 40,
      isTouchback: false,
      isBlocked: false,
      outOfBounds: false,
      returnerNumber: null,
      returnYards: 0,
      isFairCatch: false,
      fumbled: false,
      fumbleLost: false,
      notes: '',
    };
  }

  /** A punt travels from the line of scrimmage. */
  protected kickedFrom(state: GameState): number {
    return state.ballPosition;
  }

  protected kickLength(outcome: PlayOutcome): number {
    return outcome.data.puntYards ?? 0;
  }

  protected advance(state: GameState, outcome: PlayOutcome): GameState {
    const receiver = state.defense;
    if (outcome.data.isTouchback) {
      return state.firstAndTen(this.rules.puntTouchbackSpotFor(receiver), receiver, 'opponent_ball');
    }
    // A fair catch is a return of zero by definition.
    const spot = outcome.data.isFairCatch
      ? this.fieldedSpot(state, outcome)
      : this.returnedSpot(state, outcome, receiver);
    return state.firstAndTen(spot, receiver, 'opponent_ball');
  }

  protected body(form: PuntForm, _state: GameState, links: RosterLinks): Partial<NewSnap> {
    return {
      punterNumber: form.punterNumber,
      punterId: links.offense(form.punterNumber),
      puntYards: form.puntYards,
      isTouchback: form.isTouchback,
      isBlocked: form.isBlocked,
      outOfBounds: form.outOfBounds,
      returnerNumber: form.returnerNumber,
      returnerId: links.returner(form.returnerNumber),
      returnYards: form.returnYards,
      isFairCatch: form.isFairCatch,
      fumbled: form.fumbled,
      fumbleLost: form.fumbleLost,
    };
  }

  summarize(snap: Snap): string {
    if (snap.isBlocked) return 'BLOCKED punt';
    return `Punt ${snap.puntYards} yds${snap.isTouchback ? ' (TB)' : ''}`;
  }

  validate(form: PuntForm): void {
    checkNumber('puntYards', form.puntYards);
  }

  jerseyFields(form: PuntForm): JerseyField[] {
    return [['punterNumber', form.punterNumber]];
  }

  applyDefaults(form: PuntForm, defaults: PlayDefaults): PuntForm {
    return { ...form, punterNumber: defaults.punterNumber };
  }

  remember(defaults: PlayDefaults, form: PuntForm): PlayDefaults {
    return { ...defaults, punterNumber: form.punterNumber ?? defaults.punterNumber };
  }
}
