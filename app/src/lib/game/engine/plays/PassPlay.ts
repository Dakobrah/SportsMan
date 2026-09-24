import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import type { PassForm, PlayDefaults } from '../../playForm';
import type { GameState } from '../GameState';
import { type JerseyField } from '../PlayDefinition';
import { type PlayerLookup, type RosterLinks, playerTag } from '../players';
import { checkNumber, contradiction } from '../validation';
import { ScrimmagePlay } from './ScrimmagePlay';

export class PassPlay extends ScrimmagePlay<PassForm> {
  readonly type = 'pass';
  readonly kind: SnapKind = 'PASS';
  readonly title = 'Pass Play';
  readonly accent = 'var(--t-blue)';

  blank(): PassForm {
    return {
      ...ScrimmagePlay.blankScrimmage(),
      type: 'pass',
      quarterbackNumber: null,
      targetNumber: null,
      receiverNumber: null,
      isComplete: false,
      wasSacked: false,
      airYards: 0,
      isThrownAway: false,
      wasUnderPressure: false,
      isInterception: false,
    };
  }

  /** A sack is its loss; only a caught ball gains; anything else is nothing. */
  protected yardsFrom(form: PassForm): number {
    if (form.wasSacked) return -Math.abs(form.yardsGained);
    return form.isComplete ? form.yardsGained : 0;
  }

  protected lostTheBall(form: PassForm): boolean {
    return super.lostTheBall(form) || form.isInterception;
  }

  protected body(form: PassForm, _state: GameState, links: RosterLinks): Partial<NewSnap> {
    // Only a caught ball gains ground; a sack's loss lives in sackYards and
    // an incompletion moves nothing. Without this gate a pass marked
    // incomplete still carried its yards into the ball position while the
    // feed called it incomplete.
    const caught = form.isComplete;
    return {
      ...this.scrimmageColumns(form, links),
      quarterbackNumber: form.quarterbackNumber,
      quarterbackId: links.offense(form.quarterbackNumber),
      // The target is who the ball was thrown at, caught or not. The
      // receiver is only who caught it -- Django wrote the same player to
      // both, which made a drop look like a completion and catch rate
      // impossible to compute.
      targetNumber: form.targetNumber,
      targetId: links.offense(form.targetNumber),
      receiverNumber: caught ? form.targetNumber : null,
      receiverId: caught ? links.offense(form.targetNumber) : null,
      isComplete: form.isComplete,
      isThrownAway: form.isThrownAway,
      wasUnderPressure: form.wasUnderPressure,
      // Air yards are entered; yards after the catch are what is left of the
      // gain, so the two can never contradict the total.
      airYards: caught ? form.airYards : 0,
      yardsAfterCatch: caught ? form.yardsGained - form.airYards : 0,
      yardsGained: caught ? form.yardsGained : 0,
      sackYards: form.wasSacked ? this.yardsFrom(form) : 0,
      wasSacked: form.wasSacked,
      isInterception: form.isInterception,
    };
  }

  summarize(snap: Snap, players: PlayerLookup): string {
    const passer = playerTag(snap.quarterbackId, snap.quarterbackNumber, players);
    if (snap.wasSacked) return `${passer} sacked for ${snap.sackYards} yds`;
    if (snap.isInterception) return `${passer} INTERCEPTED`;
    if (!snap.isComplete) return `${passer} pass incomplete`;
    const caughtBy = snap.receiverId !== null || snap.receiverNumber !== null
      ? ` to ${playerTag(snap.receiverId, snap.receiverNumber, players)}`
      : '';
    return `${passer}${caughtBy} for ${snap.yardsGained} yds`;
  }

  validate(form: PassForm): void {
    checkNumber('yardsGained', form.yardsGained);
    if (form.wasSacked && form.isComplete) {
      contradiction('A sack cannot also be a completion.', 'isComplete');
    }
    if (form.isInterception && form.isComplete) {
      contradiction('An interception cannot also be a completion.', 'isInterception');
    }
    if (form.isComplete) checkNumber('airYards', form.airYards);
    if (form.isComplete && form.isThrownAway) {
      contradiction('A throwaway cannot also be a completion.', 'isThrownAway');
    }
    if (form.isTouchdown && !form.isComplete) {
      contradiction('A touchdown pass has to be complete.', 'isTouchdown');
    }
  }

  jerseyFields(form: PassForm): JerseyField[] {
    return [
      ['quarterbackNumber', form.quarterbackNumber],
      ['targetNumber', form.targetNumber],
    ];
  }

  applyDefaults(form: PassForm, defaults: PlayDefaults): PassForm {
    return {
      ...form,
      quarterbackNumber: defaults.quarterbackNumber,
      receiverNumber: defaults.receiverNumber,
    };
  }

  remember(defaults: PlayDefaults, form: PassForm): PlayDefaults {
    return {
      ...defaults,
      quarterbackNumber: form.quarterbackNumber ?? defaults.quarterbackNumber,
      receiverNumber: form.receiverNumber ?? defaults.receiverNumber,
    };
  }
}
