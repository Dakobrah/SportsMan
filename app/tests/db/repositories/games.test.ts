import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../support/testDb';
import { seedGame } from '../../support/seed';
import { createTeam } from '../../../src/lib/db/repositories/teams';
import { createSeason } from '../../../src/lib/db/repositories/seasons';
import {
  addScore,
  createGame,
  getGame,
  getGameContext,
  listGames,
  listQuarterScores,
  readGameCursor,
  readScores,
  setScores,
  updateGame,
  upsertQuarterScore,
  writeGameCursor,
} from '../../../src/lib/db/repositories/games';
import { insertSnap } from '../../../src/lib/db/repositories/snaps';

describe('games repository', () => {
  it('creates with sensible defaults and updates', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    expect(await getGame(db, gameId)).toMatchObject({
      opponent: 'Westfield',
      teamScore: 0,
      opponentScore: 0,
      notes: '',
    });

    const game = await getGame(db, gameId);
    await updateGame(db, gameId, {
      seasonId: game!.seasonId,
      date: '2026-09-05',
      opponent: 'Eastvale',
      location: 'away',
      weather: 'rainy',
      fieldCondition: 'wet',
      teamScore: 21,
      opponentScore: 14,
      notes: 'muddy',
    });

    expect(await getGame(db, gameId)).toMatchObject({
      opponent: 'Eastvale',
      location: 'away',
      weather: 'rainy',
      fieldCondition: 'wet',
      teamScore: 21,
      notes: 'muddy',
    });
  });

  it('joins season and team in one read', async () => {
    const db = await createTestDb();
    const { gameId, teamId, seasonId } = await seedGame(db);

    const context = await getGameContext(db, gameId);
    expect(context?.game.id).toBe(gameId);
    expect(context?.season).toMatchObject({ id: seasonId, year: 2026 });
    expect(context?.team).toMatchObject({ id: teamId, abbreviation: 'NSR' });
  });

  it('has no context for a game that does not exist', async () => {
    const db = await createTestDb();
    expect(await getGameContext(db, 999)).toBeUndefined();
  });

  it('filters the list by result and location, newest first', async () => {
    const db = await createTestDb();
    const teamId = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    const seasonId = await createSeason(db, { year: 2026, teamId });

    const make = (date: string, teamScore: number, opponentScore: number, location: 'home' | 'away') =>
      createGame(db, {
        seasonId, date, opponent: 'X', location,
        weather: 'clear', fieldCondition: 'turf', teamScore, opponentScore,
      });

    const win = await make('2026-09-04', 28, 14, 'home');
    const loss = await make('2026-09-11', 7, 21, 'away');
    const tie = await make('2026-09-18', 14, 14, 'home');

    expect((await listGames(db)).map((g) => g.id)).toEqual([tie, loss, win]);
    expect((await listGames(db, { result: 'W' })).map((g) => g.id)).toEqual([win]);
    expect((await listGames(db, { result: 'L' })).map((g) => g.id)).toEqual([loss]);
    expect((await listGames(db, { result: 'T' })).map((g) => g.id)).toEqual([tie]);
    expect((await listGames(db, { location: 'away' })).map((g) => g.id)).toEqual([loss]);
    expect((await listGames(db, { seasonId })).length).toBe(3);
  });

  it('counts snaps per game in the list', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1 });
    await insertSnap(db, gameId, { kind: 'PASS', quarter: 1 });

    expect((await listGames(db))[0].snapCount).toBe(2);
  });

  it('adds to the score and clamps at zero on undo', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    expect(await addScore(db, gameId, 6, 'us')).toMatchObject({ teamScore: 6 });
    expect(await addScore(db, gameId, 1, 'us')).toMatchObject({ teamScore: 7 });
    expect(await addScore(db, gameId, -1, 'us')).toMatchObject({ teamScore: 6 });
    // Undoing past zero must not produce a negative score.
    expect(await addScore(db, gameId, -50, 'us')).toMatchObject({ teamScore: 0 });
  });

  it('credits the side that actually scored', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    // Replaying a real game caught points from both teams landing on ours.
    await addScore(db, gameId, 6, 'us');
    await addScore(db, gameId, 7, 'them');
    expect(await addScore(db, gameId, 3, 'them')).toEqual({ teamScore: 6, opponentScore: 10 });

    await addScore(db, gameId, -3, 'them');
    expect(await readScores(db, gameId)).toEqual({ teamScore: 6, opponentScore: 7 });
  });

  it('sets either score independently', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    await setScores(db, gameId, { teamScore: 21 });
    expect(await getGame(db, gameId)).toMatchObject({ teamScore: 21, opponentScore: 0 });

    await setScores(db, gameId, { opponentScore: 17 });
    expect(await getGame(db, gameId)).toMatchObject({ teamScore: 21, opponentScore: 17 });

    // An empty edit is a no-op rather than a malformed UPDATE.
    await setScores(db, gameId, {});
    expect(await getGame(db, gameId)).toMatchObject({ teamScore: 21, opponentScore: 17 });
  });

  it('round-trips the tracker cursor, nulls included', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    expect(await readGameCursor(db, gameId)).toEqual({
      quarter: 1, down: 1, distance: 10, ballPosition: -25,
      situation: 'normal', possession: 'us',
    });

    // A dead ball has no down or distance.
    await writeGameCursor(db, gameId, {
      quarter: 3, down: null, distance: null, ballPosition: 47,
      situation: 'extra_point', possession: 'us',
    });
    expect(await readGameCursor(db, gameId)).toEqual({
      quarter: 3, down: null, distance: null, ballPosition: 47,
      situation: 'extra_point', possession: 'us',
    });

    // A turnover changes only who is driving.
    await writeGameCursor(db, gameId, {
      quarter: 3, down: 1, distance: 10, ballPosition: 47,
      situation: 'turnover', possession: 'them',
    });
    expect((await readGameCursor(db, gameId))?.possession).toBe('them');
  });

  it('upserts quarter scores rather than duplicating them', async () => {
    const db = await createTestDb();
    const { gameId } = await seedGame(db);

    await upsertQuarterScore(db, gameId, 1, { teamScore: 7, opponentScore: 0 });
    await upsertQuarterScore(db, gameId, 2, { teamScore: 3, opponentScore: 7 });
    await upsertQuarterScore(db, gameId, 1, { teamScore: 14, opponentScore: 0 });

    const quarters = await listQuarterScores(db, gameId);
    expect(quarters).toHaveLength(2);
    expect(quarters[0]).toMatchObject({ quarter: 1, teamScore: 14 });
    expect(quarters[1]).toMatchObject({ quarter: 2, opponentScore: 7 });
  });
});
