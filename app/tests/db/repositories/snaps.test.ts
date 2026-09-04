import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../support/testDb';
import { seedGame, seedPlayer } from '../../support/seed';
import { createGame } from '../../../src/lib/db/repositories/games';
import {
  countSnaps,
  deleteSnap,
  getSnap,
  insertSnap,
  lastSnap,
  listAssists,
  addAssist,
  listSnaps,
  nextSequenceNumber,
} from '../../../src/lib/db/repositories/snaps';

describe('snaps repository', () => {
  it('allocates sequence numbers from one', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    expect(await nextSequenceNumber(db, gameId)).toBe(1);
    expect((await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 })).sequenceNumber).toBe(1);
    expect((await insertSnap(db, gameId, { kind: 'PASS', quarter: 1 })).sequenceNumber).toBe(2);
    expect(await nextSequenceNumber(db, gameId)).toBe(3);
  });

  it('numbers each game independently', async () => {
    const db = await createTestDb();
    const { gameId, seasonId } = await seedGame(db);
    const other = await createGame(db, {
      seasonId, date: '2026-09-11', opponent: 'Eastvale',
      location: 'away', weather: 'clear', fieldCondition: 'grass',
    });

    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    expect((await insertSnap(db, other, { kind: 'RUN', quarter: 1 })).sequenceNumber).toBe(1);
  });

  it('gives every concurrent insert a distinct sequence number', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    // Django read MAX(sequence_number) and then inserted as two statements,
    // so a rapid double-tap could hand two plays the same number. Computing
    // it inside the INSERT closes that window.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => insertSnap(db, gameId, { kind: 'RUN', quarter: 1 })),
    );

    const sequences = results.map((r) => r.sequenceNumber).sort((a, b) => a - b);
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(sequences).size).toBe(10);
    expect(await countSnaps(db, gameId)).toBe(10);
  });

  it('refuses a duplicate sequence number outright', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });

    // The UNIQUE constraint is the backstop under the allocation above.
    await expect(
      db.run(
        'INSERT INTO snaps (game_id, sequence_number, kind, quarter) VALUES (?, 1, ?, 1)',
        [gameId, 'PASS'],
      ),
    ).rejects.toThrow();
  });

  it('round-trips booleans, and leaves three-valued penalty flags null', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    const { id } = await insertSnap(db, gameId, {
      kind: 'RUN', quarter: 1, yardsGained: 8,
      isTouchdown: true, isFirstDown: false, fumbled: false,
    });

    const snap = await getSnap(db, id);
    expect(snap?.isTouchdown).toBe(true);
    expect(snap?.isFirstDown).toBe(false);
    // Never recorded, so it must stay null rather than collapse to false --
    // an imported Django penalty genuinely does not know if it was accepted.
    expect(snap?.penaltyAccepted).toBeNull();
    expect(snap?.penaltyOnOffense).toBeNull();
  });

  it('stores a penalty with its accepted flag', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    const { id } = await insertSnap(db, gameId, {
      kind: 'PENALTY', quarter: 2, hadPenalty: true,
      penaltyDescription: 'Holding', penaltyYards: 10,
      penaltyOnOffense: true, penaltyAccepted: false,
    });

    expect(await getSnap(db, id)).toMatchObject({
      kind: 'PENALTY', hadPenalty: true, penaltyYards: 10,
      penaltyOnOffense: true, penaltyAccepted: false,
    });
  });

  it('rejects a kind the schema does not know', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    await expect(
      // @ts-expect-error deliberately outside the SnapKind union
      insertSnap(db, gameId, { kind: 'SAFETY', quarter: 1 }),
    ).rejects.toThrow();
  });

  it('filters by quarter and kind, and honours order and limit', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1 });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 2 });
    await insertSnap(db, gameId, { kind: 'FG', quarter: 2 });

    expect(await listSnaps(db, gameId)).toHaveLength(4);
    expect(await listSnaps(db, gameId, { quarter: 2 })).toHaveLength(2);
    expect(await listSnaps(db, gameId, { kind: 'RUN' })).toHaveLength(2);

    const newestFirst = await listSnaps(db, gameId, { order: 'desc', limit: 2 });
    expect(newestFirst.map((s) => s.sequenceNumber)).toEqual([4, 3]);
  });

  it('finds and removes the last play', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    expect(await lastSnap(db, gameId)).toBeUndefined();

    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    const second = await insertSnap(db, gameId, { kind: 'PASS', quarter: 1, yardsGained: 15 });

    expect((await lastSnap(db, gameId))?.id).toBe(second.id);

    await deleteSnap(db, second.id);
    expect((await lastSnap(db, gameId))?.sequenceNumber).toBe(1);
    // The freed number is reused -- undo then re-record keeps plays contiguous.
    expect(await nextSequenceNumber(db, gameId)).toBe(2);
  });

  it('records defensive assists once each and cascades with the snap', async () => {
    const db = await createTestDb();
    const { teamId, gameId } = await seedGame(db);
    const tackler = await seedPlayer(db, teamId, { position: 'LB', number: 52 });
    const { id } = await insertSnap(db, gameId, { kind: 'DEFENSE', quarter: 1 });

    await addAssist(db, id, tackler, 'TACKLE');
    await addAssist(db, id, tackler, 'TACKLE'); // ignored, not duplicated
    await addAssist(db, id, tackler, 'COV');

    expect(await listAssists(db, id)).toHaveLength(2);

    await deleteSnap(db, id);
    expect(await listAssists(db, id)).toHaveLength(0);
  });
});
