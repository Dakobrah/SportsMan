/**
 * Rules a coach expects the tracker to know without being told.
 *
 * Each case is written the way it would be said on a sideline -- "a ten-yard
 * flag from our own five is half the distance" -- and asserts where the ball
 * and the down end up. See ~/.openclaw/shared/notes/sportsman-football-rules.md:
 * where an older test disagrees with these, the older test is wrong.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedRoster } from '../support/seed';
import { GameState } from '../../src/lib/game/engine/GameState';
import { PlayOutcome } from '../../src/lib/game/engine/PlayOutcome';
import { plays } from '../../src/lib/game/engine/PlayRegistry';
import { changeQuarter, recordPlay } from '../../src/lib/game/recordPlay';
import { blankForm } from '../../src/lib/game/playForm';
import { OPENING_CURSOR } from '../../src/lib/game/cursor';
import { opponentYardLine, ownYardLine, yardLineOf } from '../../src/lib/game/field';
import { Ruleset } from '../../src/lib/game/engine/Ruleset';
import type { Possession } from '../../src/lib/game/field';

/** The constants these tests were written against are the college rules. */
const college = Ruleset.for('NCAA');

/** `down` and `toGo` for `team` at `spot`, in the second quarter. */
function at(spot: number, team: Possession = 'us', down = 1, toGo = 10): GameState {
  return new GameState({
    quarter: 2, down, distance: toGo, ballPosition: spot, situation: 'normal', possession: team,
  });
}

const flag = (yards: number, onOffense: boolean, autoFirstDown = false) =>
  new PlayOutcome({ penaltyYards: yards, onOffense, accepted: true, autoFirstDown });

const gain = (yards: number, result = {}) => new PlayOutcome({}, { yardsGained: yards, ...result });

describe('penalties', () => {
  const penalty = plays.forType('penalty');

  describe('half the distance to the goal', () => {
    it('spots a ten-yard flag on our offense at our 3, not our goal line, from our 5', () => {
      const next = penalty.next(at(ownYardLine(5)), flag(10, true));
      // Half of five is two and a half. The ball is never spotted nearer the
      // goal than that, so it moves two, to our 3.
      expect(next.ballPosition).toBe(ownYardLine(3));
      expect(next).toMatchObject({ down: 1, distance: 12 });
    });

    it('enforces the full distance when that is no more than half', () => {
      const next = penalty.next(at(ownYardLine(20)), flag(10, true));
      expect(next.ballPosition).toBe(ownYardLine(10));
      expect(next).toMatchObject({ down: 1, distance: 20 });
    });

    it('cannot move the ball off our own 1', () => {
      const next = penalty.next(at(ownYardLine(1)), flag(5, true));
      expect(next.ballPosition).toBe(ownYardLine(1));
    });

    it('halves a defensive flag at the goal they defend', () => {
      // First and goal at their 4; offside on the defense is half the distance.
      const next = penalty.next(at(opponentYardLine(4), 'us', 1, 4), flag(5, false));
      expect(next.ballPosition).toBe(opponentYardLine(2));
      expect(next).toMatchObject({ down: 1, distance: 2 });
    });

    it('works the same for them, driving the other way', () => {
      const next = penalty.next(at(yardLineOf('them', 6), 'them'), flag(15, true));
      expect(next.ballPosition).toBe(yardLineOf('them', 3));
    });
  });

  describe('automatic first down', () => {
    it('gives a first down for defensive holding on third and fifteen', () => {
      const next = penalty.next(at(ownYardLine(30), 'us', 3, 15), flag(5, false, true));
      expect(next).toMatchObject({ down: 1, distance: 10, ballPosition: ownYardLine(35) });
    });

    it('survives being saved and read back', async () => {
      const { db, gameId, roster } = await seedRoster(await createTestDb());
      const thirdAndFifteen = { ...OPENING_CURSOR, down: 3, distance: 15, ballPosition: ownYardLine(30) };
      const out = await recordPlay(db, gameId, thirdAndFifteen, {
        ...blankForm('penalty'),
        penaltyName: 'Holding (Defense)', penaltyYards: 5, onOffense: false, autoFirstDown: true,
      }, roster);
      // The flag was dropped on save, so this came back third and ten.
      expect(out.cursor).toMatchObject({ down: 1, distance: 10 });
    });
  });
});

describe('defensive touchdowns score for whoever was defending', () => {
  const run = plays.forType('run');

  it('gives them the try when their defense scores on our possession', () => {
    const next = run.next(at(ownYardLine(30), 'us'), gain(0, { isDefensiveTouchdown: true }));
    expect(next).toMatchObject({ possession: 'them', situation: 'extra_point' });
    expect(next.ballPosition).toBe(college.extraPointSpotFor('them'));
  });

  it('still gives us the try when our defense scores', () => {
    const next = run.next(at(ownYardLine(30), 'them'), gain(0, { isDefensiveTouchdown: true }));
    expect(next).toMatchObject({ possession: 'us', situation: 'extra_point' });
  });

  it('credits the six points to the defending team', () => {
    expect(run.scorer({ isDefensiveTouchdown: true, isSafety: false }, 'us')).toBe('them');
    expect(run.scorer({ isDefensiveTouchdown: true, isSafety: false }, 'them')).toBe('us');
    expect(run.scorer({ isDefensiveTouchdown: false, isSafety: false }, 'us')).toBe('us');
  });
});

describe('safety', () => {
  it('is two points for the defense', () => {
    const run = plays.forType('run');
    expect(run.pointsFor({ ...blankForm('run'), isSafety: true })).toBe(2);
    expect(run.scorer({ isDefensiveTouchdown: false, isSafety: true }, 'us')).toBe('them');
  });

  it('is scored when the ball carrier is tackled in his own end zone', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const onOurTwo = { ...OPENING_CURSOR, ballPosition: ownYardLine(2) };
    const out = await recordPlay(db, gameId, onOurTwo,
      { ...blankForm('run'), yardsGained: -3 }, roster);
    expect(out.opponentScore).toBe(2);
    expect(out.teamScore).toBe(0);
  });

  it('is scored on a sack in the end zone', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const onOurOne = { ...OPENING_CURSOR, ballPosition: ownYardLine(1) };
    const out = await recordPlay(db, gameId, onOurOne,
      { ...blankForm('pass'), wasSacked: true, yardsGained: 4 }, roster);
    expect(out.opponentScore).toBe(2);
  });

  it('is not a loss that stops short of the goal line', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const onOurFive = { ...OPENING_CURSOR, ballPosition: ownYardLine(5) };
    const out = await recordPlay(db, gameId, onOurFive,
      { ...blankForm('run'), yardsGained: -4 }, roster);
    expect(out.opponentScore).toBe(0);
    expect(out.cursor).toMatchObject({ down: 2, ballPosition: ownYardLine(1) });
  });

  it('makes the conceding team free-kick from its own 20', () => {
    const next = plays.forType('run').next(at(ownYardLine(2)), gain(-3, { isSafety: true }));
    expect(next).toMatchObject({
      possession: 'us', situation: 'kickoff', down: null, distance: null,
      ballPosition: college.safetyKickSpotFor('us'),
    });
  });

  it('kicks the free kick from the 20, not the 35', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const safety = await recordPlay(db, gameId, { ...OPENING_CURSOR, ballPosition: ownYardLine(2) },
      { ...blankForm('run'), yardsGained: -3 }, roster);
    const kick = await recordPlay(db, gameId, safety.cursor,
      { ...blankForm('kickoff'), kickYards: 50, returnYards: 10 }, roster);
    // From our 20, fifty yards lands on their 30; ten back puts them on their 40.
    expect(kick.cursor).toMatchObject({ possession: 'them', ballPosition: yardLineOf('them', 40) });
  });
});

describe('onside kick', () => {
  const kickoff = plays.forType('kickoff');
  const onside = (recovered: boolean) =>
    new PlayOutcome({ kickYards: 11, isOnsideKick: true, onsideRecovered: recovered, returnYards: 0 });
  const kicking = new GameState({
    quarter: 4, down: null, distance: null, ballPosition: college.kickoffSpotFor('us'),
    situation: 'kickoff', possession: 'us',
  });

  it('is our ball where we recovered it', () => {
    const next = kickoff.next(kicking, onside(true));
    expect(next).toMatchObject({ possession: 'us', down: 1, distance: 10, situation: 'normal' });
    expect(next.ballPosition).toBe(ownYardLine(46));
  });

  it('is their ball, on a short field, when they recover', () => {
    const next = kickoff.next(kicking, onside(false));
    expect(next).toMatchObject({ possession: 'them', down: 1 });
    expect(next.ballPosition).toBe(ownYardLine(46));
  });

  it('survives being saved and read back', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const out = await recordPlay(db, gameId, kicking.toCursor(), {
      ...blankForm('kickoff'), kickYards: 11, returnYards: 0,
      isOnsideKick: true, onsideRecovered: true,
    }, roster);
    expect(out.cursor.possession).toBe('us');
  });
});

describe('halftime', () => {
  it('restarts the third quarter with a kickoff by whoever received the opening one', () => {
    const lateInTheHalf = at(opponentYardLine(30), 'them', 3, 4);
    const next = lateInTheHalf.toQuarter(3, 'us');
    expect(next).toMatchObject({
      quarter: 3, possession: 'us', situation: 'kickoff', down: null, distance: null,
      ballPosition: college.kickoffSpotFor('us'),
    });
  });

  it('keeps the drive alive across the first and third quarter breaks', () => {
    const drive = at(opponentYardLine(30), 'us', 3, 4);
    expect(drive.toQuarter(2, 'them').toCursor()).toEqual({ ...drive.toCursor(), quarter: 2 });
  });

  it('works out the second-half kicker from the opening kickoff', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    // They kicked off to open the game, so we received and we kick the second half.
    const opening = { ...OPENING_CURSOR, situation: 'kickoff' as const, possession: 'them' as const,
                      down: null, distance: null, ballPosition: college.kickoffSpotFor('them') };
    const received = await recordPlay(db, gameId, opening, { ...blankForm('kickoff') }, roster);
    const third = await changeQuarter(db, gameId, { ...received.cursor, quarter: 2 }, 3);
    expect(third).toMatchObject({ quarter: 3, possession: 'us', situation: 'kickoff' });
  });

  it('gives them the second-half kick when they received the opening one', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const opening = { ...OPENING_CURSOR, situation: 'kickoff' as const, possession: 'us' as const,
                      down: null, distance: null, ballPosition: college.kickoffSpotFor('us') };
    const received = await recordPlay(db, gameId, opening, { ...blankForm('kickoff') }, roster);
    const third = await changeQuarter(db, gameId, { ...received.cursor, quarter: 2 }, 3);
    expect(third).toMatchObject({ quarter: 3, possession: 'them', situation: 'kickoff' });
  });

  it('assumes we received when no opening kickoff was recorded', async () => {
    const { db, gameId } = await seedRoster(await createTestDb());
    const third = await changeQuarter(db, gameId, { ...OPENING_CURSOR, quarter: 2 }, 3);
    expect(third).toMatchObject({ possession: 'us', situation: 'kickoff' });
  });
});
