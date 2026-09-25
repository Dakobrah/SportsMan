/**
 * The same game, played under high-school, college and NFL rules.
 *
 * Geometry does not change between levels; where the rulebook spots the ball
 * does. Each table below is one rule, level by level, stated the way a coach
 * would -- "a kickoff touchback comes out at the 20 in high school".
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedRoster } from '../support/seed';
import { GameState } from '../../src/lib/game/engine/GameState';
import { PlayOutcome } from '../../src/lib/game/engine/PlayOutcome';
import { PlayRegistry } from '../../src/lib/game/engine/PlayRegistry';
import { Ruleset, type RulesetId } from '../../src/lib/game/engine/Ruleset';
import { GameTracker } from '../../src/lib/game/recordPlay';
import { blankForm, defaultScrimmageKick } from '../../src/lib/game/playForm';
import { opponentYardLine, ownYardLine, yardLineOf } from '../../src/lib/game/field';
import { createSeason, getSeason, setSeasonRuleset } from '../../src/lib/db/repositories/seasons';
import type { Possession } from '../../src/lib/game/field';

const LEVELS: RulesetId[] = ['NFHS', 'NCAA', 'NFL'];

/** First and ten for `team` at `spot`. */
function at(spot: number, team: Possession = 'us', situation: 'normal' | 'kickoff' = 'normal'): GameState {
  const deadBall = situation === 'kickoff';
  return new GameState({
    quarter: 2, down: deadBall ? null : 1, distance: deadBall ? null : 10,
    ballPosition: spot, situation, possession: team,
  });
}

const playsUnder = (id: RulesetId) => PlayRegistry.for(Ruleset.for(id));

describe('kickoffs', () => {
  it.each([
    ['NFHS', 40], ['NCAA', 35], ['NFL', 35],
  ] as const)('%s: kickoffs are taken from our own %i', (id, line) => {
    expect(Ruleset.for(id).kickoffSpotFor('us')).toBe(ownYardLine(line));
  });

  it.each([
    ['NFHS', 20], ['NCAA', 25], ['NFL', 35],
  ] as const)('%s: a kickoff touchback comes out at the receiving %i', (id, line) => {
    const kick = at(Ruleset.for(id).kickoffSpotFor('us'), 'us', 'kickoff');
    const next = playsUnder(id).forType('kickoff').next(kick, new PlayOutcome({ isTouchback: true, kickYards: 65 }));
    expect(next).toMatchObject({ possession: 'them', down: 1 });
    expect(next.ballPosition).toBe(yardLineOf('them', line));
  });

  it('travel from the level\'s kickoff line', () => {
    // Fifty yards with no return: from our 40 in high school that is their
    // 10; from our 35 in college, their 15.
    const kick = (id: RulesetId) => playsUnder(id).forType('kickoff').next(
      at(Ruleset.for(id).kickoffSpotFor('us'), 'us', 'kickoff'),
      new PlayOutcome({ kickYards: 50, returnYards: 0 }),
    ).ballPosition;
    expect(kick('NFHS')).toBe(yardLineOf('them', 10));
    expect(kick('NCAA')).toBe(yardLineOf('them', 15));
  });

  it.each(LEVELS)('follow a good field goal from the kicking team\'s line (%s)', (id) => {
    const next = playsUnder(id).forType('field_goal').next(
      at(opponentYardLine(20)), new PlayOutcome({ result: 'GOOD' }),
    );
    expect(next).toMatchObject({ situation: 'kickoff', possession: 'us' });
    expect(next.ballPosition).toBe(Ruleset.for(id).kickoffSpotFor('us'));
  });

  it.each(LEVELS)('open the second half from the level\'s line (%s)', (id) => {
    const rules = Ruleset.for(id);
    expect(at(0).toQuarter(3, 'them', rules).ballPosition).toBe(rules.kickoffSpotFor('them'));
  });

  it.each(LEVELS)('after a safety are still free kicks from the 20 (%s)', (id) => {
    const next = playsUnder(id).forType('run').next(at(ownYardLine(2)), new PlayOutcome({}, { isSafety: true }));
    expect(next.ballPosition).toBe(ownYardLine(20));
  });
});

describe('a missed field goal', () => {
  const miss = (id: RulesetId, from: number) =>
    playsUnder(id).forType('field_goal').next(at(from), new PlayOutcome({ result: 'MISS' }));

  it('is a touchback to the 20 in high school, wherever it was tried from', () => {
    expect(miss('NFHS', opponentYardLine(30))).toMatchObject({ possession: 'them', ballPosition: yardLineOf('them', 20) });
    expect(miss('NFHS', opponentYardLine(5)).ballPosition).toBe(yardLineOf('them', 20));
  });

  it('goes back to the line of scrimmage in college', () => {
    expect(miss('NCAA', opponentYardLine(30))).toMatchObject({ possession: 'them', ballPosition: yardLineOf('them', 30) });
  });

  it('never leaves the defense inside its own 20 in college', () => {
    expect(miss('NCAA', opponentYardLine(12)).ballPosition).toBe(yardLineOf('them', 20));
  });

  it('goes to the spot of the kick, seven yards back, in the NFL', () => {
    expect(miss('NFL', opponentYardLine(30)).ballPosition).toBe(yardLineOf('them', 37));
  });

  it('comes out to the 20 in the NFL when the spot of the kick is inside it', () => {
    // From their 10 the kick is held at their 17.
    expect(miss('NFL', opponentYardLine(10)).ballPosition).toBe(yardLineOf('them', 20));
  });

  it.each(LEVELS)('is not a blocked one, which the defense takes at the line (%s)', (id) => {
    const next = playsUnder(id).forType('field_goal').next(
      at(opponentYardLine(25)), new PlayOutcome({ result: 'BLOCK' }),
    );
    expect(next.ballPosition).toBe(opponentYardLine(25));
  });
});

describe('the try', () => {
  it.each([
    ['NFHS', 'KICK', 3], ['NFHS', '2PT_RUN', 3],
    ['NCAA', 'KICK', 3], ['NCAA', '2PT_PASS', 3],
    ['NFL', 'KICK', 15], ['NFL', '2PT_RUN', 2],
  ] as const)('%s: a %s is snapped from the %i', (id, attempt, line) => {
    expect(Ruleset.for(id).extraPointSpotFor('us', attempt)).toBe(opponentYardLine(line));
  });

  it('is recorded from the line its attempt is snapped from', () => {
    const pro = playsUnder('NFL').forType('extra_point');
    const scored = at(opponentYardLine(15));
    const twoPoint = pro.toRow({ ...blankForm('extra_point'), attemptType: '2PT_PASS' }, scored, []);
    expect(twoPoint.ballPosition).toBe(opponentYardLine(2));
  });

  it.each([
    ['NFHS', 3], ['NCAA', 3], ['NFL', 15],
  ] as const)('is set up at the kick line after a touchdown (%s: %i)', (id, line) => {
    const next = playsUnder(id).forType('run').next(at(opponentYardLine(4)), new PlayOutcome({}, { isTouchdown: true }));
    expect(next.ballPosition).toBe(opponentYardLine(line));
  });
});

describe('the opening', () => {
  it.each([
    ['NFHS', 20], ['NCAA', 25], ['NFL', 35],
  ] as const)('assumes a touchback on the opening kick (%s: our %i)', (id, line) => {
    expect(GameState.opening(Ruleset.for(id)).ballPosition).toBe(ownYardLine(line));
  });
});

describe('the combined kick form', () => {
  it('opens a 42-yarder on a punt in high school and a field goal above it', () => {
    const theirTwentyFive = opponentYardLine(25);
    expect(defaultScrimmageKick(theirTwentyFive, 'us', Ruleset.for('NFHS'))).toBe('punt');
    expect(defaultScrimmageKick(theirTwentyFive, 'us', Ruleset.for('NCAA'))).toBe('field_goal');
    expect(defaultScrimmageKick(theirTwentyFive, 'us', Ruleset.for('NFL'))).toBe('field_goal');
  });
});

describe('a season', () => {
  it('is college unless told otherwise, as every season before this was', async () => {
    const { db, seasonId } = await seedRoster(await createTestDb());
    expect((await getSeason(db, seasonId))?.ruleset).toBe('NCAA');
  });

  it('refuses a level it does not know', async () => {
    const { db, teamId } = await seedRoster(await createTestDb());
    // @ts-expect-error deliberately outside the RulesetId union
    await expect(createSeason(db, { year: 2027, teamId, ruleset: 'XFL' })).rejects.toThrow();
  });

  it('sets the rules its games are tracked under', async () => {
    const { db, seasonId, gameId, roster } = await seedRoster(await createTestDb());
    await setSeasonRuleset(db, seasonId, 'NFHS');
    const tracker = new GameTracker(db, gameId);

    // A game nobody has touched opens after a high-school touchback.
    const loaded = await tracker.load();
    expect(loaded.rules.id).toBe('NFHS');
    expect(loaded.cursor.ballPosition).toBe(ownYardLine(20));

    // A touchdown, the try, then the kickoff from our 40.
    const td = await tracker.record(loaded.cursor, { ...blankForm('run'), yardsGained: 80 }, roster);
    const pat = await tracker.record(td.cursor, blankForm('extra_point'), roster);
    expect(pat.cursor).toMatchObject({ situation: 'kickoff', ballPosition: ownYardLine(40) });

    // Touchback: their 20, not college's 25.
    const kick = await tracker.record(pat.cursor, { ...blankForm('kickoff'), isTouchback: true }, roster);
    expect(kick.cursor).toMatchObject({ possession: 'them', ballPosition: yardLineOf('them', 20) });
  });

  it('replays under its own rules after an undo', async () => {
    const { db, seasonId, gameId, roster } = await seedRoster(await createTestDb());
    await setSeasonRuleset(db, seasonId, 'NFL');
    const tracker = new GameTracker(db, gameId);
    const loaded = await tracker.load();

    const kick = await tracker.record(
      { ...loaded.cursor, situation: 'kickoff', down: null, distance: null, ballPosition: ownYardLine(35) },
      { ...blankForm('kickoff'), isTouchback: true }, roster,
    );
    await tracker.record(kick.cursor, { ...blankForm('run'), yardsGained: 3 }, roster);
    const undone = await tracker.undo();
    // Rebuilt from the kickoff under NFL rules: their 35.
    expect(undone.cursor.ballPosition).toBe(yardLineOf('them', 35));
  });
});
