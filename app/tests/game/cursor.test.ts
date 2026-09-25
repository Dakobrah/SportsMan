import { describe, expect, it } from 'vitest';
import {
  OPENING_CURSOR,
  advance,
  cursorAfter,
  playTypeOf,
  rebuildCursor,
} from '../../src/lib/game/cursor';
import { Ruleset } from '../../src/lib/game/engine/Ruleset';
import { createTestDb } from '../support/testDb';
import { seedGame } from '../support/seed';
import { insertSnap } from '../../src/lib/db/repositories/snaps';
import { makeSnap } from '../support/snapFixture';

/** The constants these tests were written against are the college rules. */
const college = Ruleset.for('NCAA');

describe('cursor', () => {
  it('opens first and ten on our own 25', () => {
    expect(OPENING_CURSOR).toEqual({
      quarter: 1, down: 1, distance: 10, ballPosition: -25,
      situation: 'normal', possession: 'us',
    });
  });

  it('carries the quarter through, because the state machine has no clock', () => {
    const cursor = { ...OPENING_CURSOR, quarter: 3 };
    const next = advance(cursor, {
      down: 2, distance: 6, ballPosition: -21, situation: 'normal', possession: 'us',
    });
    expect(next.quarter).toBe(3);
    expect(next).toMatchObject({ down: 2, distance: 6, ballPosition: -21 });
  });

  it('maps every snap kind to a play type', () => {
    expect(playTypeOf('RUN')).toBe('run');
    expect(playTypeOf('PASS')).toBe('pass');
    expect(playTypeOf('FG')).toBe('field_goal');
    expect(playTypeOf('XP')).toBe('extra_point');
    expect(playTypeOf('PUNT')).toBe('punt');
    expect(playTypeOf('KICKOFF')).toBe('kickoff');
    expect(playTypeOf('PENALTY')).toBe('penalty');
  });

  it('advances a gain rather than repeating the stored state', () => {
    // The snap holds 1st & 10 at our own 25 and a 12-yard gain. Django read
    // the stored values straight back and showed 1st & 10 at our 25 again.
    const after = cursorAfter(
      makeSnap({ kind: 'RUN', down: 1, distance: 10, ballPosition: -25, yardsGained: 12, isFirstDown: true }),
    );
    expect(after.ballPosition).toBe(-13);
    expect(after.down).toBe(1);
    expect(after.distance).toBe(10);
  });

  it('sends a touchdown to the extra point spot', () => {
    const after = cursorAfter(makeSnap({ kind: 'RUN', yardsGained: 20, isTouchdown: true }));
    expect(after.situation).toBe('extra_point');
    expect(after.ballPosition).toBe(college.extraPointSpotFor('us'));
    expect(after.down).toBeNull();
  });

  it('sends an extra point and a made field goal to the kickoff spot', () => {
    for (const snap of [
      makeSnap({ kind: 'XP', attemptType: 'KICK', result: 'GOOD' }),
      makeSnap({ kind: 'FG', result: 'GOOD' }),
    ]) {
      const after = cursorAfter(snap);
      expect(after.situation).toBe('kickoff');
      expect(after.ballPosition).toBe(college.kickoffSpotFor('us'));
      expect(after.down).toBeNull();
    }
  });

  it('keeps the quarter of the snap it advances from', () => {
    expect(cursorAfter(makeSnap({ kind: 'RUN', quarter: 4 })).quarter).toBe(4);
  });

  it('rebuilds the opening cursor for a game with no plays', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    expect(await rebuildCursor(db, gameId)).toEqual(OPENING_CURSOR);
  });

  it('rebuilds from the last play, not the last stored state', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    await insertSnap(db, gameId, {
      kind: 'RUN', quarter: 2, down: 1, distance: 10, ballPosition: -25, yardsGained: 4,
    });
    await insertSnap(db, gameId, {
      kind: 'RUN', quarter: 2, down: 2, distance: 6, ballPosition: -21,
      yardsGained: 8, isFirstDown: true,
    });

    const cursor = await rebuildCursor(db, gameId);
    expect(cursor).toEqual({
      quarter: 2, down: 1, distance: 10, ballPosition: -13,
      situation: 'normal', possession: 'us',
    });
  });
});
