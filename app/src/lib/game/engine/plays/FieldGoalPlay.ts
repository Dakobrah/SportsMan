import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import { kickoffSpotFor } from '../../field';
import type { FieldGoalForm, PlayDefaults } from '../../playForm';
import type { GameState } from '../GameState';
import { type JerseyField, PlayDefinition } from '../PlayDefinition';
import type { PlayOutcome } from '../PlayOutcome';
import type { RosterLinks } from '../players';
import { POINTS, type ScoringFacts } from '../types';
import { checkNumber } from '../validation';

export class FieldGoalPlay extends PlayDefinition<FieldGoalForm> {
  readonly type = 'field_goal';
  readonly kind: SnapKind = 'FG';
  readonly title = 'Field Goal';
  readonly accent = 'var(--t-purple)';

  blank(): FieldGoalForm {
    return { type: 'field_goal', kickerNumber: null, kickDistance: 30, result: 'GOOD', notes: '' };
  }

  protected advance(state: GameState, { data }: PlayOutcome): GameState {
    return data.result === 'GOOD'
      // The scoring team kicks off from its own 35.
      ? state.deadBall(kickoffSpotFor(state.offense), state.offense, 'kickoff')
      // A miss hands the ball over on the spot.
      : state.turnover(state.ballPosition, 'opponent_ball');
  }

  protected body(form: FieldGoalForm, _state: GameState, links: RosterLinks): Partial<NewSnap> {
    return {
      kickerNumber: form.kickerNumber,
      kickerId: links.offense(form.kickerNumber),
      kickDistance: form.kickDistance,
      result: form.result,
    };
  }

  summarize(snap: Snap): string {
    return `FG ${snap.result} (${snap.kickDistance} yds)`;
  }

  points(facts: ScoringFacts): number {
    return facts.result === 'GOOD' ? POINTS.fieldGoal : 0;
  }

  scoringFacts(form: FieldGoalForm): ScoringFacts {
    return { ...super.scoringFacts(form), result: form.result };
  }

  validate(form: FieldGoalForm): void {
    checkNumber('kickDistance', form.kickDistance);
  }

  jerseyFields(form: FieldGoalForm): JerseyField[] {
    return [['kickerNumber', form.kickerNumber]];
  }

  applyDefaults(form: FieldGoalForm, defaults: PlayDefaults): FieldGoalForm {
    return { ...form, kickerNumber: defaults.kickerNumber };
  }

  remember(defaults: PlayDefaults, form: FieldGoalForm): PlayDefaults {
    return { ...defaults, kickerNumber: form.kickerNumber ?? defaults.kickerNumber };
  }
}
