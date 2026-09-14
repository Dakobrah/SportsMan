/**
 * Target versus receiver.
 *
 * Django wrote the same player to both columns, which made a drop
 * indistinguishable from a completion at the row level and catch rate
 * impossible. These pin the split, and the derived yards after the catch.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { JERSEY, seedRoster } from '../support/seed';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR } from '../../src/lib/game/cursor';
import { blankForm } from '../../src/lib/game/playForm';
import { getSnap } from '../../src/lib/db/repositories/snaps';
import { receivingByPlayer } from '../../src/lib/db/reports/players';

const pass = (over: Record<string, unknown> = {}) => ({
  ...blankForm('pass'),
  quarterbackNumber: JERSEY.qb,
  targetNumber: JERSEY.wr,
  ...over,
});

describe('target and receiver', () => {
  it('records a target on an incompletion but no receiver', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const out = await recordPlay(db, gameId, OPENING_CURSOR, pass({ isComplete: false }), roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.targetNumber).toBe(JERSEY.wr);
    expect(snap?.targetId).not.toBeNull();
    // Nobody caught it, so nobody is the receiver.
    expect(snap?.receiverId).toBeNull();
    expect(snap?.receiverNumber).toBeNull();
  });

  it('records both on a completion', async () => {
    const { db, gameId, roster, wr } = await seedRoster(await createTestDb());
    const out = await recordPlay(db, gameId, OPENING_CURSOR,
      pass({ isComplete: true, yardsGained: 18 }), roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.targetId).toBe(wr);
    expect(snap?.receiverId).toBe(wr);
  });

  it('makes catch rate computable', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    for (const isComplete of [true, false, true, false]) {
      await recordPlay(db, gameId, OPENING_CURSOR,
        pass({ isComplete, yardsGained: isComplete ? 10 : 0 }), roster);
    }

    const line = (await receivingByPlayer(db, { gameIds: [gameId] }))[0];
    expect(line).toMatchObject({ targets: 4, receptions: 2, yards: 20 });
  });

  it('derives yards after the catch rather than storing a contradiction', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const out = await recordPlay(db, gameId, OPENING_CURSOR,
      pass({ isComplete: true, yardsGained: 22, airYards: 9 }), roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.airYards).toBe(9);
    expect(snap?.yardsAfterCatch).toBe(13);
    // Whatever is entered, the parts always sum to the whole.
    expect(snap!.airYards + snap!.yardsAfterCatch).toBe(snap!.yardsGained);
  });

  it('handles a catch behind the line of scrimmage', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    // A screen: thrown backwards, run forwards.
    const out = await recordPlay(db, gameId, OPENING_CURSOR,
      pass({ isComplete: true, yardsGained: 14, airYards: -3 }), roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.yardsAfterCatch).toBe(17);
    expect(snap!.airYards + snap!.yardsAfterCatch).toBe(14);
  });

  it('stores no air yards on an incompletion', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const out = await recordPlay(db, gameId, OPENING_CURSOR,
      pass({ isComplete: false, airYards: 25 }), roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.airYards).toBe(0);
    expect(snap?.yardsAfterCatch).toBe(0);
  });

  it('records a throwaway and a pressured passer', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const out = await recordPlay(db, gameId, OPENING_CURSOR,
      pass({ targetNumber: null, isThrownAway: true, wasUnderPressure: true }), roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.isThrownAway).toBe(true);
    expect(snap?.wasUnderPressure).toBe(true);
    expect(snap?.targetId).toBeNull();
  });

  it('refuses a throwaway that is also a completion', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        pass({ isComplete: true, isThrownAway: true }), roster),
    ).rejects.toThrow(/throwaway/i);
  });

  it('bounds air yards', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        pass({ isComplete: true, yardsGained: 10, airYards: 500 }), roster),
    ).rejects.toThrow(/Air yards/);
  });
});
