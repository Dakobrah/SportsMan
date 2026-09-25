import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import { enforcedPenaltyYards, yardsToGoalFor } from '../../field';
import type { PenaltyForm } from '../../playForm';
import type { GameState } from '../GameState';
import { PlayDefinition } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';
import { checkNumber, ValidationError } from '../validation';

export class PenaltyPlay extends PlayDefinition<PenaltyForm> {
  readonly type = 'penalty';
  readonly kind: SnapKind = 'PENALTY';
  readonly title = 'Penalty';
  readonly accent = 'var(--t-amber)';

  blank(): PenaltyForm {
    return {
      type: 'penalty',
      penaltyName: '',
      penaltyYards: 5,
      onOffense: true,
      accepted: true,
      autoFirstDown: false,
      notes: '',
    };
  }

  protected advance(state: GameState, { data }: PlayOutcome): GameState {
    // A declined penalty is no play at all: the down still advances.
    if (data.accepted === false) {
      return state.with({ down: state.currentDown + 1, distance: state.toGo, situation: 'normal' });
    }

    // Against the team with the ball it goes backward toward the goal it
    // defends and the distance grows; against the defense, forward toward
    // the goal it attacks. Either way never more than half the way there.
    const onOffense = data.onOffense ?? true;
    const room = onOffense ? state.yardsToOwnGoal : state.yardsToGoal;
    const enforced = enforcedPenaltyYards(data.penaltyYards ?? 0, room);
    const signed = onOffense ? -enforced : enforced;
    const spot = state.spotAfter(signed);
    const toGo = state.toGo - signed;

    if (data.autoFirstDown || toGo <= 0) return state.firstAndTen(spot, state.offense);
    return state.with({
      down: state.currentDown,
      distance: Math.min(toGo, yardsToGoalFor(spot, state.offense)),
      ballPosition: spot,
      situation: 'normal',
    });
  }

  protected body(form: PenaltyForm): Partial<NewSnap> {
    return {
      hadPenalty: true,
      penaltyDescription: form.penaltyName,
      // A declined penalty moves the ball nowhere.
      penaltyYards: form.accepted ? form.penaltyYards : 0,
      penaltyOnOffense: form.onOffense,
      penaltyAccepted: form.accepted,
      // Only meaningful when accepted; a declined flag gives nothing.
      penaltyAutoFirstDown: form.accepted && form.autoFirstDown,
    };
  }

  summarize(snap: Snap): string {
    return `PENALTY: ${snap.penaltyDescription || (snap.penaltyOnOffense ? 'on offense' : 'on defense')}`;
  }

  validate(form: PenaltyForm): void {
    checkNumber('penaltyYards', form.penaltyYards);
    if (!form.penaltyName.trim()) {
      throw new ValidationError('Pick a penalty.', 'required', 'penaltyName');
    }
  }
}
