import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import type { RunForm } from '../../playForm';
import type { GameState } from '../GameState';
import { type JerseyField } from '../PlayDefinition';
import { type PlayerLookup, type RosterLinks, playerTag } from '../players';
import { checkNumber } from '../validation';
import { ScrimmagePlay } from './ScrimmagePlay';

export class RunPlay extends ScrimmagePlay<RunForm> {
  readonly type = 'run';
  readonly kind: SnapKind = 'RUN';
  readonly title = 'Run Play';
  readonly accent = 'var(--t-green)';

  blank(): RunForm {
    return {
      ...ScrimmagePlay.noDefense(),
      type: 'run',
      playId: null,
      formation: '',
      ballCarrierNumber: null,
      yardsGained: 0,
      isTouchdown: false,
      isFirstDown: false,
      fumbled: false,
      fumbleLost: false,
      notes: '',
    };
  }

  protected body(form: RunForm, _state: GameState, links: RosterLinks): Partial<NewSnap> {
    return {
      ...this.defense(form, links),
      playId: form.playId,
      formation: form.formation,
      ballCarrierNumber: form.ballCarrierNumber,
      ballCarrierId: links.offense(form.ballCarrierNumber),
      yardsGained: form.yardsGained,
      isTouchdown: form.isTouchdown,
      isFirstDown: form.isFirstDown,
      fumbled: form.fumbled,
      fumbleLost: form.fumbleLost,
    };
  }

  summarize(snap: Snap, players: PlayerLookup): string {
    return `${playerTag(snap.ballCarrierId, snap.ballCarrierNumber, players)} run for ${snap.yardsGained} yds`;
  }

  validate(form: RunForm): void {
    checkNumber('yardsGained', form.yardsGained);
  }

  jerseyFields(form: RunForm): JerseyField[] {
    return [['ballCarrierNumber', form.ballCarrierNumber]];
  }
}
