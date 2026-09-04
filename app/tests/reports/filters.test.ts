import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { createGame } from '../../src/lib/db/repositories/games';
import { createSeason } from '../../src/lib/db/repositories/seasons';
import { insertSnap } from '../../src/lib/db/repositories/snaps';
import { GAIN_SQL, TO_GOAL_SQL, snapWhere } from '../../src/lib/db/reports/filters';
import { snapYardage } from '../../src/lib/game/summary';
import { yardsToGoalFor, type Possession } from '../../src/lib/game/field';
import { makeSnap } from '../support/snapFixture';

const count = async (
  db: Awaited<ReturnType<typeof createTestDb>>,
  ...args: Parameters<typeof snapWhere>
) => {
  const where = snapWhere(...args);
  const row = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM snaps WHERE ${where.sql}`,
    where.params,
  );
  return row?.n ?? 0;
};

describe('snapWhere', () => {
  it('matches everything when nothing is filtered', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    expect(await count(db, {})).toBe(1);
  });

  it('scopes to explicit games', async () => {
    const db = await createTestDb();
    const { gameId, seasonId } = await seedGame(db);
    const other = await createGame(db, {
      seasonId, date: '2026-09-11', opponent: 'Eastvale',
      location: 'away', weather: 'clear', fieldCondition: 'grass',
    });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    await insertSnap(db, other, { kind: 'RUN', quarter: 1 });
    await insertSnap(db, other, { kind: 'PASS', quarter: 1 });

    expect(await count(db, { gameIds: [gameId] })).toBe(1);
    expect(await count(db, { gameIds: [other] })).toBe(2);
    expect(await count(db, { gameIds: [gameId, other] })).toBe(3);
  });

  it('treats an empty game list as no games, not all games', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    expect(await count(db, { gameIds: [] })).toBe(0);
  });

  it('scopes to a season without joining', async () => {
    const db = await createTestDb();
    const { teamId, gameId, seasonId } = await seedGame(db);
    const otherSeason = await createSeason(db, { year: 2025, teamId });
    const otherGame = await createGame(db, {
      seasonId: otherSeason, date: '2025-09-11', opponent: 'Eastvale',
      location: 'away', weather: 'clear', fieldCondition: 'grass',
    });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    await insertSnap(db, otherGame, { kind: 'RUN', quarter: 1 });

    expect(await count(db, { seasonId })).toBe(1);
    expect(await count(db, { seasonId: otherSeason })).toBe(1);
  });

  it('scopes to a side', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, possession: 'us' });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, possession: 'them' });
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1, possession: 'them' });

    expect(await count(db, { possession: 'us' })).toBe(1);
    expect(await count(db, { possession: 'them' })).toBe(2);
  });

  it('ANDs every filter together, with parameters in placeholder order', async () => {
    const db = await createTestDb();
    const { gameId, seasonId } = await seedGame(db);
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, possession: 'us' });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, possession: 'them' });

    const where = snapWhere({ gameIds: [gameId], seasonId, possession: 'us' });
    expect(where.params).toEqual([gameId, seasonId, 'us']);
    expect(await count(db, { gameIds: [gameId], seasonId, possession: 'us' })).toBe(1);
  });

  it('accepts extra predicates and a table alias', async () => {
    const db = await createTestDb();
    const { teamId, gameId } = await seedGame(db);
    const player = await seedPlayer(db, teamId, { number: 22 });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, ballCarrierId: player });
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1 });

    // The aliased form has to produce valid SQL when joined to players.
    const where = snapWhere({ possession: 'us' }, ["s.kind = 'RUN'"], 's.');
    const row = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM snaps s
       JOIN players p ON p.id = s.ball_carrier_id
       WHERE ${where.sql}`,
      where.params,
    );
    expect(row?.n).toBe(1);
  });
});

describe('SQL pushdowns stay in step with their TypeScript twins', () => {
  it('GAIN_SQL matches snapYardage for runs, passes and sacks', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    const cases = [
      { kind: 'RUN' as const, yardsGained: 7 },
      { kind: 'RUN' as const, yardsGained: 0 },
      { kind: 'RUN' as const, yardsGained: -3 },
      { kind: 'PASS' as const, yardsGained: 14, isComplete: true },
      { kind: 'PASS' as const, yardsGained: 0 },
      // The one that matters: a sack keeps its loss in sackYards.
      { kind: 'PASS' as const, yardsGained: 0, wasSacked: true, sackYards: -8 },
      { kind: 'PASS' as const, yardsGained: 0, wasSacked: true, sackYards: 0 },
    ];
    for (const snap of cases) await insertSnap(db, gameId, { ...snap, quarter: 1 });

    const rows = await db.all<{ sequence_number: number; gain: number }>(
      `SELECT sequence_number, ${GAIN_SQL} AS gain FROM snaps ORDER BY sequence_number`,
    );
    const expected = cases.map((c) => snapYardage(makeSnap(c)));
    expect(rows.map((r) => r.gain)).toEqual(expected);
  });

  it('TO_GOAL_SQL matches yardsToGoalFor at every position, both sides', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    const sides: Possession[] = ['us', 'them'];
    const wanted: number[] = [];
    for (const possession of sides) {
      for (let position = -50; position <= 50; position++) {
        await insertSnap(db, gameId, {
          kind: 'RUN', quarter: 1, possession, ballPosition: position,
        });
        wanted.push(yardsToGoalFor(position, possession));
      }
    }

    const rows = await db.all<{ to_goal: number }>(
      `SELECT ${TO_GOAL_SQL} AS to_goal FROM snaps ORDER BY sequence_number`,
    );
    expect(rows.map((r) => r.to_goal)).toEqual(wanted);
  });
});
