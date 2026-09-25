import type { NewSnap } from '../../../db/repositories/snaps';
import type { Snap, SnapKind } from '../../../db/repositories/types';
import type { ExtraPointForm, PlayDefaults } from '../../playForm';
import type { GameState } from '../GameState';
import { type JerseyField, PlayDefinition } from '../PlayDefinition';
import type { RosterLinks } from '../players';
import { POINTS, type ScoringFacts } from '../types';

/** The try after a touchdown: a one-point kick or a two-point play. */
export class ExtraPointPlay extends PlayDefinition<ExtraPointForm> {
  readonly type = 'extra_point';
  readonly kind: SnapKind = 'XP';
  readonly title = 'Extra Point / 2-Point';
  readonly accent = 'var(--t-purple)';

  blank(): ExtraPointForm {
    return { type: 'extra_point', attemptType: 'KICK', result: 'GOOD', kickerNumber: null, notes: '' };
  }

  /** Good or not, the scoring team kicks off next. */
  protected advance(state: GameState): GameState {
    return state.deadBall(this.rules.kickoffSpotFor(state.offense), state.offense, 'kickoff');
  }

  protected body(form: ExtraPointForm, state: GameState, links: RosterLinks): Partial<NewSnap> {
    return {
      // A try is a dead-ball snap on the defense's side, not from the cursor
      // -- and in the NFL a kick and a two-point try are snapped from
      // different lines.
      down: null,
      distance: null,
      ballPosition: this.rules.extraPointSpotFor(state.possession, form.attemptType),
      attemptType: form.attemptType,
      result: form.result,
      kickerNumber: form.kickerNumber,
      kickerId: links.offense(form.kickerNumber),
    };
  }

  summarize(snap: Snap): string {
    return `${snap.attemptType === 'KICK' ? 'PAT' : '2PT'} ${snap.result}`;
  }

  points(facts: ScoringFacts): number {
    if (facts.result !== 'GOOD') return 0;
    return facts.attemptType === 'KICK' ? POINTS.patKick : POINTS.twoPoint;
  }

  scoringFacts(form: ExtraPointForm): ScoringFacts {
    return { ...super.scoringFacts(form), result: form.result, attemptType: form.attemptType };
  }

  jerseyFields(form: ExtraPointForm): JerseyField[] {
    return [['kickerNumber', form.kickerNumber]];
  }

  applyDefaults(form: ExtraPointForm, defaults: PlayDefaults): ExtraPointForm {
    return { ...form, kickerNumber: defaults.kickerNumber };
  }

  remember(defaults: PlayDefaults, form: ExtraPointForm): PlayDefaults {
    return { ...defaults, kickerNumber: form.kickerNumber ?? defaults.kickerNumber };
  }
}
