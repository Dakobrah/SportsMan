import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { insertSnap } from '../../src/lib/db/repositories/snaps';
import { setPlayerActive } from '../../src/lib/db/repositories/players';
import {
  kickingByPlayer, passingByPlayer, puntingByPlayer,
  receivingByPlayer, rushingByPlayer,
} from '../../src/lib/db/reports/players';

async function setup() {
  const db = await createTestDb();
  const { teamId, gameId } = await seedGame(db);
  const rb = await seedPlayer(db, teamId, { lastName: 'Danforth', position: 'RB', number: 22 });
  const qb = await seedPlayer(db, teamId, { lastName: 'Okafor', position: 'QB', number: 7 });
  const wr = await seedPlayer(db, teamId, { lastName: 'Vance', position: 'WR', number: 81 });
  const k = await seedPlayer(db, teamId, { lastName: 'Bell', position: 'K', number: 3 });
  return { db, teamId, gameId, rb, qb, wr, k };
}

describe('per-player lines', () => {
  it('groups rushing by carrier, best first', async () => {
    const { db, gameId, rb, qb } = await setup();
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, ballCarrierId: rb, yardsGained: 12, isFirstDown: true });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, ballCarrierId: rb, yardsGained: 3, isTouchdown: true });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 2, ballCarrierId: qb, yardsGained: 5 });

    const rows = await rushingByPlayer(db, {});
    expect(rows.map((r) => r.lastName)).toEqual(['Danforth', 'Okafor']);
    expect(rows[0]).toMatchObject({
      attempts: 2, yards: 15, touchdowns: 1, firstDowns: 1, longest: 12, number: 22,
    });
  });

  it('counts targets on incompletions but receptions only on catches', async () => {
    const { db, gameId, qb, wr } = await setup();
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1, quarterbackId: qb, receiverId: wr, isComplete: true, yardsGained: 18 });
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1, quarterbackId: qb, receiverId: wr, isComplete: false });

    const rows = await receivingByPlayer(db, {});
    expect(rows[0]).toMatchObject({ targets: 2, receptions: 1, yards: 18, lastName: 'Vance' });
  });

  it('excludes a sack from a quarterback’s attempts', async () => {
    const { db, gameId, qb } = await setup();
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1, quarterbackId: qb, isComplete: true, yardsGained: 9 });
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1, quarterbackId: qb, wasSacked: true, sackYards: -6 });

    expect((await passingByPlayer(db, {}))[0]).toMatchObject({
      attempts: 1, completions: 1, yards: 9, sacks: 1, sackYards: -6,
    });
  });

  it('reports kicking and punting per player', async () => {
    const { db, gameId, k } = await setup();
    await insertSnap(db, gameId, { kind: 'FG', quarter: 1, kickerId: k, kickDistance: 38, result: 'GOOD' });
    await insertSnap(db, gameId, { kind: 'FG', quarter: 2, kickerId: k, kickDistance: 51, result: 'MISS' });
    await insertSnap(db, gameId, { kind: 'PUNT', quarter: 3, punterId: k, puntYards: 46 });

    expect((await kickingByPlayer(db, {}))[0]).toMatchObject({ attempts: 2, made: 1, longest: 38 });
    expect((await puntingByPlayer(db, {}))[0]).toMatchObject({ punts: 1, yards: 46, longest: 46 });
  });

  it('never lets an opponent play reach a player line', async () => {
    const { db, gameId, rb } = await setup();
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, ballCarrierId: rb, yardsGained: 5, possession: 'us' });
    // Their #22 is a different person: the row carries a number and no id, so
    // the join excludes it by construction rather than by a filter.
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 2, ballCarrierNumber: 22, yardsGained: 40, possession: 'them' });

    const rows = await rushingByPlayer(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].yards).toBe(5);
  });

  it('still reports a retired player’s past production', async () => {
    const { db, gameId, rb } = await setup();
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, ballCarrierId: rb, yardsGained: 7 });
    await setPlayerActive(db, rb, false);

    expect((await rushingByPlayer(db, {}))[0]).toMatchObject({ yards: 7 });
  });
});
