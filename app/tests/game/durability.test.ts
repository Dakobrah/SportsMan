/**
 * The reload-rewind bug, pinned.
 *
 * Django rebuilt the tracker's resume state from the last snap's own
 * down/distance/ball_position (apps/frontend/tracker.py:377-389). A snap
 * records the state *before* that play ran, so every reload rewound exactly
 * one play, and a quarter change with no play after it vanished entirely.
 *
 * These assert the two properties that fix requires: what `recordPlay`
 * returns is what a reload produces, and the cursor survives a reload even
 * when no play follows it.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { loadTracker, recordPlay, undoLastPlay } from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR, rebuildCursor } from '../../src/lib/game/cursor';
import { blankForm, type PlayForm } from '../../src/lib/game/playForm';
import { EXTRA_POINT_SPOT } from '../../src/lib/game/field';
import { readGameCursor, writeGameCursor } from '../../src/lib/db/repositories/games';
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

describe('tracker durability', () => {
  it('does not rewind a play across a reload', async () => {
    const { db, gameId, rb, roster } = await setup();

    // 1st & 10 on our own 25, twelve-yard gain.
    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 12, isFirstDown: true },
      roster,
    );
    expect(out.cursor.ballPosition).toBe(-13);

    // Django showed our own 25 again here.
    const reloaded = await loadTracker(db, gameId);
    expect(reloaded.cursor.ballPosition).toBe(-13);
    expect(reloaded.cursor).toEqual(out.cursor);
  });

  it('returns the cursor a reload would rebuild, for every kind of play', async () => {
    const { db, gameId, rb, qb, k, roster } = await setup();

    const forms: PlayForm[] = [
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 6 },
      { ...blankForm('pass'), quarterbackId: qb, receiverId: rb, isComplete: true, yardsGained: 14, isFirstDown: true },
      { ...blankForm('pass'), quarterbackId: qb, wasSacked: true, yardsGained: 6 },
      { ...blankForm('penalty'), penaltyName: 'False Start', penaltyYards: 5, accepted: true, onOffense: true },
      { ...blankForm('punt'), punterId: k, puntYards: 42 },
      { ...blankForm('kickoff'), kickerId: k, kickYards: 60, isTouchback: true },
      { ...blankForm('field_goal'), kickerId: k, kickDistance: 34, result: 'GOOD' },
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerId: k },
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 30, isTouchdown: true },
    ];

    let cursor = OPENING_CURSOR;
    for (const form of forms) {
      const out = await recordPlay(db, gameId, cursor, form, roster);

      // The stored state and the returned state must be the same state.
      expect(await rebuildCursor(db, gameId)).toEqual(out.cursor);
      expect(await readGameCursor(db, gameId)).toEqual(out.cursor);

      cursor = out.cursor;
    }
  });

  it('keeps a quarter change that no play follows', async () => {
    const { db, gameId, rb, roster } = await setup();

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 5 },
      roster,
    );

    // The coach taps the quarter badge at the end of the first quarter and
    // the whistle blows before another play. Django lost this entirely.
    await writeGameCursor(db, gameId, { ...out.cursor, quarter: 2 });

    expect((await loadTracker(db, gameId)).cursor.quarter).toBe(2);
  });

  it('carries the quarter forward through later plays', async () => {
    const { db, gameId, rb, roster } = await setup();

    const first = await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 3 }, roster);
    await writeGameCursor(db, gameId, { ...first.cursor, quarter: 3 });

    const resumed = await loadTracker(db, gameId);
    const next = await recordPlay(db, gameId, resumed.cursor,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 4 }, roster);

    expect(next.cursor.quarter).toBe(3);
    expect((await loadTracker(db, gameId)).cursor.quarter).toBe(3);
  });

  it('reopens the extra point after a reload mid-chain', async () => {
    const { db, gameId, rb, roster } = await setup();

    await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 40, isTouchdown: true }, roster);

    // Force-quit between the touchdown and the extra point.
    const reloaded = await loadTracker(db, gameId);
    expect(reloaded.cursor.situation).toBe('extra_point');
    expect(reloaded.cursor.ballPosition).toBe(EXTRA_POINT_SPOT);
    expect(reloaded.cursor.down).toBeNull();
  });

  it('leaves the stored cursor consistent after an undo', async () => {
    const { db, gameId, rb, roster } = await setup();

    let cursor = OPENING_CURSOR;
    for (const yards of [4, 9, 15]) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierId: rb, yardsGained: yards }, roster)).cursor;
    }

    const undone = await undoLastPlay(db, gameId);
    expect(await readGameCursor(db, gameId)).toEqual(undone.cursor);
    expect((await loadTracker(db, gameId)).cursor).toEqual(undone.cursor);
  });

  it('rebuilds a usable cursor for a game whose cursor was never written', async () => {
    const { db, gameId, rb, roster } = await setup();

    await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 7, isFirstDown: false }, roster);

    // Simulate an imported game: plays present, cursor still at defaults.
    await writeGameCursor(db, gameId, OPENING_CURSOR);
    expect(await rebuildCursor(db, gameId)).toMatchObject({ down: 2, ballPosition: -18 });
  });
});
