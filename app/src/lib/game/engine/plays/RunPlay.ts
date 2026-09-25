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
    return { ...ScrimmagePlay.blankScrimmage(), type: 'run', ballCarrierNumber: null };
  }

  protected yardsFrom(form: RunForm): number {
    return form.yardsGained;
  }

  protected body(form: RunForm, _state: GameState, links: RosterLinks): Partial<NewSnap> {
    return {
      ...this.scrimmageColumns(form, links),
      ballCarrierNumber: form.ballCarrierNumber,
      ballCarrierId: links.offense(form.ballCarrierNumber),
      yardsGained: form.yardsGained,
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
