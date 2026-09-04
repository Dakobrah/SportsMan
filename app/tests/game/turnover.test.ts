/**
 * Turnovers, end to end.
 *
 * The reported bug: recording an interception flipped the whole tracker --
 * the ball jumped across the field and the yard line changed -- because the
 * old model expressed field position relative to whoever had the ball, so a
 * change of possession mirrored the coordinate across midfield.
 *
 * On a real field a turnover moves nobody. The other team takes over on that
 * spot and runs the other way. These assert exactly that, for every kind of
 * turnover, through the real write path and across a reload.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { loadTracker, recordPlay, undoLastPlay } from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR, rebuildCursor } from '../../src/lib/game/cursor';
import { blankForm } from '../../src/lib/game/playForm';
import { toDisplay } from '../../src/lib/game/field';
import { getPlayer } from '../../src/lib/db/repositories/players';

async function setup() {
  const db = await createTestDb();
  const { teamId, gameId } = await seedGame(db);
  const rb = await seedPlayer(db, teamId, { position: 'RB', number: 22 });
  const qb = await seedPlayer(db, teamId, { position: 'QB', number: 7 });
  const k = await seedPlayer(db, teamId, { position: 'K', number: 3 });
  const roster = (await Promise.all([rb, qb, k].map((id) => getPlayer(db, id)))).filter(
    (p): p is NonNullable<typeof p> => p != null,
  );
  return { db, gameId, rb, qb, k, roster };
}

/** 2nd & 7 at our own 20. */
const OUR_20 = { ...OPENING_CURSOR, down: 2, distance: 7, ballPosition: -30 };

describe('turnovers keep the ball where it is', () => {
  it('an interception changes possession and nothing else about the spot', async () => {
    const { db, gameId, qb, roster } = await setup();

    const out = await recordPlay(db, gameId, OUR_20,
      { ...blankForm('pass'), quarterbackId: qb, isInterception: true }, roster);

    expect(out.cursor.ballPosition).toBe(-30);
    expect(toDisplay(out.cursor.ballPosition)).toBe('OWN 20');
    expect(out.cursor.possession).toBe('them');
    expect(out.cursor.down).toBe(1);
    expect(out.cursor.distance).toBe(10);
    expect(out.cursor.situation).toBe('turnover');
  });

  it('a lost fumble hands over at the spot the play ended', async () => {
    const { db, gameId, rb, roster } = await setup();

    const out = await recordPlay(db, gameId, OUR_20,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 4, fumbled: true, fumbleLost: true },
      roster);

    // Four yards forward from our own 20, then they take over there.
    expect(out.cursor.ballPosition).toBe(-26);
    expect(toDisplay(out.cursor.ballPosition)).toBe('OWN 24');
    expect(out.cursor.possession).toBe('them');
  });

  it('a turnover on downs leaves the ball where it stopped', async () => {
    const { db, gameId, rb, roster } = await setup();

    const out = await recordPlay(db, gameId,
      { ...OPENING_CURSOR, down: 4, distance: 3, ballPosition: -25 },
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 1 }, roster);

    expect(out.cursor.ballPosition).toBe(-24);
    expect(out.cursor.possession).toBe('them');
    expect(out.cursor.situation).toBe('turnover_on_downs');
  });

  it('a missed field goal hands over at the spot of the kick', async () => {
    const { db, gameId, k, roster } = await setup();

    const out = await recordPlay(db, gameId,
      { ...OPENING_CURSOR, down: 4, distance: 3, ballPosition: 15 },
      { ...blankForm('field_goal'), kickerId: k, kickDistance: 42, result: 'MISS' }, roster);

    expect(out.cursor.ballPosition).toBe(15);
    expect(out.cursor.possession).toBe('them');
  });

  it('a punt lands downfield rather than mirroring', async () => {
    const { db, gameId, k, roster } = await setup();

    const out = await recordPlay(db, gameId,
      { ...OPENING_CURSOR, down: 4, distance: 8, ballPosition: -35 },
      { ...blankForm('punt'), punterId: k, puntYards: 45 }, roster);

    // 45 yards from our own 15 is their 40, and they take over there.
    expect(out.cursor.ballPosition).toBe(10);
    expect(toDisplay(out.cursor.ballPosition)).toBe('OPP 40');
    expect(out.cursor.possession).toBe('them');
  });

  it('a kickoff gives the receiving team their own 25, not ours', async () => {
    const { db, gameId, k, roster } = await setup();

    const out = await recordPlay(db, gameId,
      { ...OPENING_CURSOR, down: null, distance: null, ballPosition: -15, situation: 'kickoff' },
      { ...blankForm('kickoff'), kickerId: k, kickYards: 62, isTouchback: true }, roster);

    expect(out.cursor.ballPosition).toBe(25);
    expect(toDisplay(out.cursor.ballPosition)).toBe('OPP 25');
    expect(out.cursor.possession).toBe('them');
  });

  it('survives a reload with the ball and possession intact', async () => {
    const { db, gameId, qb, roster } = await setup();

    const out = await recordPlay(db, gameId, OUR_20,
      { ...blankForm('pass'), quarterbackId: qb, isInterception: true }, roster);

    const reloaded = await loadTracker(db, gameId);
    expect(reloaded.cursor).toEqual(out.cursor);
    expect(await rebuildCursor(db, gameId)).toEqual(out.cursor);
  });

  it('gives the ball back when the turnover is undone', async () => {
    const { db, gameId, rb, qb, roster } = await setup();

    const before = await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 5 }, roster);
    await recordPlay(db, gameId, before.cursor,
      { ...blankForm('pass'), quarterbackId: qb, isInterception: true }, roster);

    const undone = await undoLastPlay(db, gameId);
    expect(undone.cursor).toEqual(before.cursor);
    expect(undone.cursor.possession).toBe('us');
  });

  it('drives the other way once they have it', async () => {
    const { db, gameId, qb, rb, roster } = await setup();

    const turnover = await recordPlay(db, gameId, OUR_20,
      { ...blankForm('pass'), quarterbackId: qb, isInterception: true }, roster);
    expect(turnover.cursor.ballPosition).toBe(-30);

    // Their eight-yard gain moves the ball toward OUR end zone, not away.
    const theirGain = await recordPlay(db, gameId, turnover.cursor,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 8 }, roster);

    expect(theirGain.cursor.ballPosition).toBe(-38);
    expect(toDisplay(theirGain.cursor.ballPosition)).toBe('OWN 12');
    expect(theirGain.cursor.possession).toBe('them');
    expect(theirGain.cursor.down).toBe(2);
    expect(theirGain.cursor.distance).toBe(2);
  });

  it('measures their goal-to-go against our end zone', async () => {
    const { db, gameId, qb, roster } = await setup();

    // They intercept at our own 6.
    const out = await recordPlay(db, gameId,
      { ...OPENING_CURSOR, down: 2, distance: 7, ballPosition: -44 },
      { ...blankForm('pass'), quarterbackId: qb, isInterception: true }, roster);

    expect(out.cursor.possession).toBe('them');
    // Six yards to the end zone they are attacking, so first and goal.
    expect(out.cursor.distance).toBe(6);
  });
});
