import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../support/testDb';
import { seedPlayer } from '../../support/seed';
import {
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  listTeamsWithCounts,
  updateTeam,
} from '../../../src/lib/db/repositories/teams';
import { createSeason } from '../../../src/lib/db/repositories/seasons';
import { countSnaps, insertSnap } from '../../../src/lib/db/repositories/snaps';
import { createGame } from '../../../src/lib/db/repositories/games';

describe('teams repository', () => {
  it('creates, reads back and updates', async () => {
    const db = await createTestDb();
    const id = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });

    expect(await getTeam(db, id)).toMatchObject({ name: 'Northside', abbreviation: 'NSR' });

    await updateTeam(db, id, { name: 'Northside Rams', abbreviation: 'NSR' });
    expect((await getTeam(db, id))?.name).toBe('Northside Rams');
  });

  it('returns undefined for a team that does not exist', async () => {
    const db = await createTestDb();
    expect(await getTeam(db, 999)).toBeUndefined();
  });

  it('rejects a duplicate abbreviation', async () => {
    const db = await createTestDb();
    await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    await expect(
      createTeam(db, { name: 'Nearside', abbreviation: 'NSR' }),
    ).rejects.toThrow();
  });

  it('orders by name and counts only active players', async () => {
    const db = await createTestDb();
    const west = await createTeam(db, { name: 'Westfield', abbreviation: 'WFD' });
    const north = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });

    await seedPlayer(db, north, { number: 1 });
    await seedPlayer(db, north, { number: 2 });
    await seedPlayer(db, north, { number: 3, isActive: false });
    await seedPlayer(db, west, { number: 9 });

    expect((await listTeams(db)).map((t) => t.name)).toEqual(['Northside', 'Westfield']);

    const counts = await listTeamsWithCounts(db);
    expect(counts.find((t) => t.id === north)?.playerCount).toBe(2);
    expect(counts.find((t) => t.id === west)?.playerCount).toBe(1);
  });

  it('cascades a delete all the way down to snaps', async () => {
    const db = await createTestDb();
    const teamId = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    const seasonId = await createSeason(db, { year: 2026, teamId });
    const gameId = await createGame(db, {
      seasonId,
      date: '2026-09-04',
      opponent: 'Westfield',
      location: 'home',
      weather: 'clear',
      fieldCondition: 'turf',
    });
    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, yardsGained: 5 });
    expect(await countSnaps(db, gameId)).toBe(1);

    await deleteTeam(db, teamId);

    expect(await getTeam(db, teamId)).toBeUndefined();
    expect(await countSnaps(db, gameId)).toBe(0);
  });
});
