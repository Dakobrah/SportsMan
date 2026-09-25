/**
 * The rules that differ by level of play.
 *
 * Geometry -- where a yard line is, which way a team drives, half the
 * distance to the goal -- is the same at every level and lives in field.ts.
 * What a rulebook sets lives here: where kickoffs and tries are taken from,
 * where touchbacks come out, what a missed field goal gives the defense.
 * A season chooses one, and the play classes are built with it.
 *
 * Anything not listed is the same at all three levels as the app models it:
 * four downs to make ten, the 20 for a punt touchback and a safety kick,
 * and the scoring values.
 */
import type { AttemptType, RulesetId } from '../../db/repositories/types';
import { type Possession, advanceBy, otherTeam, yardLineOf, yardsToGoalFor } from '../field';
import type { GameState } from './GameState';

export type { RulesetId };

export abstract class Ruleset {
  abstract readonly id: RulesetId;
  /** What a coach calls it. */
  abstract readonly name: string;
  /**
   * The longest field goal the combined kick form opens on. Past it, a punt
   * is the likelier call -- one tap switches either way.
   */
  abstract readonly fieldGoalRange: number;

  /** The kicking team's yard line for a kickoff. */
  protected abstract readonly kickoffLine: number;
  /** The receiving team's yard line after a kickoff touchback. */
  protected abstract readonly kickoffTouchbackLine: number;
  protected readonly puntTouchbackLine: number = 20;
  protected readonly safetyKickLine: number = 20;

  /** The defense's yard line the try is snapped from. */
  protected abstract tryLine(attempt: AttemptType): number;

  /** Where the defense takes over after a field goal that missed (not one that was blocked). */
  abstract missedFieldGoalSpot(state: GameState): number;

  // -------------------------------------------------------------------------
  // Spots, as absolute positions
  // -------------------------------------------------------------------------

  kickoffSpotFor(kicker: Possession): number {
    return yardLineOf(kicker, this.kickoffLine);
  }

  kickoffTouchbackSpotFor(receiver: Possession): number {
    return yardLineOf(receiver, this.kickoffTouchbackLine);
  }

  puntTouchbackSpotFor(receiver: Possession): number {
    return yardLineOf(receiver, this.puntTouchbackLine);
  }

  /** After a safety, the team that conceded it free-kicks from its own 20. */
  safetyKickSpotFor(kicker: Possession): number {
    return yardLineOf(kicker, this.safetyKickLine);
  }

  /** The try is snapped on the defense's side, so the scorer's opponent's yard line. */
  extraPointSpotFor(scorer: Possession, attempt: AttemptType = 'KICK'): number {
    return yardLineOf(otherTeam(scorer), this.tryLine(attempt));
  }

  /**
   * The floor college and the pros both put under a missed field goal: the
   * defense never takes over inside its own 20.
   */
  protected noCloserThanTheTwenty(spot: number, state: GameState): number {
    return yardsToGoalFor(spot, state.offense) < 20 ? yardLineOf(state.defense, 20) : spot;
  }

  // -------------------------------------------------------------------------
  // The three levels
  // -------------------------------------------------------------------------

  static for(id: RulesetId | null | undefined): Ruleset {
    return (id && RULESETS[id]) || RULESETS.NCAA;
  }

  /**
   * College. Every constant the app used before rules were configurable was
   * a college one, so existing seasons are this and replay unchanged.
   */
  static get default(): Ruleset {
    return RULESETS.NCAA;
  }

  static get all(): readonly Ruleset[] {
    return Object.values(RULESETS);
  }
}

/** National Federation of State High School Associations. */
class HighSchoolRules extends Ruleset {
  readonly id = 'NFHS';
  readonly name = 'High school (NFHS)';
  readonly fieldGoalRange = 35;
  protected readonly kickoffLine = 40;
  protected readonly kickoffTouchbackLine = 20;

  protected tryLine(): number {
    return 3;
  }

  /**
   * A missed field goal is treated like a punt: one that crosses the goal
   * line is a touchback at the 20. (One that falls short and dies in the
   * field is the defense's where it stopped -- the form does not record
   * that spot, and it is the rarer case.)
   */
  missedFieldGoalSpot(state: GameState): number {
    return yardLineOf(state.defense, 20);
  }
}

class CollegeRules extends Ruleset {
  readonly id = 'NCAA';
  readonly name = 'College (NCAA)';
  readonly fieldGoalRange = 47;
  protected readonly kickoffLine = 35;
  protected readonly kickoffTouchbackLine = 25;

  protected tryLine(): number {
    return 3;
  }

  /** The previous spot -- the line of scrimmage -- or the 20. */
  missedFieldGoalSpot(state: GameState): number {
    return this.noCloserThanTheTwenty(state.ballPosition, state);
  }
}

class ProRules extends Ruleset {
  readonly id = 'NFL';
  readonly name = 'NFL';
  readonly fieldGoalRange = 52;
  protected readonly kickoffLine = 35;
  /** Moved from the 30 to the 35 for the 2025 season. */
  protected readonly kickoffTouchbackLine = 35;

  /** A kicked extra point from the 15; a two-point try from the 2. */
  protected tryLine(attempt: AttemptType): number {
    return attempt === 'KICK' ? 15 : 2;
  }

  /** The spot of the kick -- seven yards behind the line, where it was held -- or the 20. */
  missedFieldGoalSpot(state: GameState): number {
    return this.noCloserThanTheTwenty(advanceBy(state.ballPosition, -7, state.offense), state);
  }
}

const RULESETS: Record<RulesetId, Ruleset> = {
  NFHS: new HighSchoolRules(),
  NCAA: new CollegeRules(),
  NFL: new ProRules(),
};
