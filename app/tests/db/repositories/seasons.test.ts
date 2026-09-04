import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../support/testDb';
import { createTeam } from '../../../src/lib/db/repositories/teams';
import {
  createSeason,
  currentSeason,
  deleteSeason,
  getSeason,
  listSeasons,
} from '../../../src/lib/db/repositories/seasons';
import { createGame } from '../../../src/lib/db/repositories/games';

const newGame = (db: Parameters<typeof createGame>[0], seasonId: number, date: string) =>
  createGame(db, {
    seasonId,
    date,
    opponent: 'Westfield',
    location: 'home',
    weather: 'clear',
    fieldCondition: 'turf',
  });

describe('seasons repository', () => {
  it('creates and reads back', async () => {
    const db = await createTestDb();
    const teamId = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    const id = await createSeason(db, { year: 2026, teamId });
    expect(await getSeason(db, id)).toMatchObject({ year: 2026, teamId });
  });

  it('rejects the same year twice for one team but allows it across teams', async () => {
    const db = await createTestDb();
    const north = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    const west = await createTeam(db, { name: 'Westfield', abbreviation: 'WFD' });

    await createSeason(db, { year: 2026, teamId: north });
    await expect(createSeason(db, { year: 2026, teamId: north })).rejects.toThrow();
    await expect(createSeason(db, { year: 2026, teamId: west })).resolves.toBeGreaterThan(0);
  });

  it('lists newest first with game counts, and filters by team', async () => {
    const db = await createTestDb();
    const north = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    const west = await createTeam(db, { name: 'Westfield', abbreviation: 'WFD' });

    const s2025 = await createSeason(db, { year: 2025, teamId: north });
    const s2026 = await createSeason(db, { year: 2026, teamId: north });
    await createSeason(db, { year: 2026, teamId: west });

    await newGame(db, s2026, '2026-09-04');
    await newGame(db, s2026, '2026-09-11');
    await newGame(db, s2025, '2025-09-05');

    const all = await listSeasons(db);
    expect(all).toHaveLength(3);
    expect(all[0].year).toBe(2026);

    const forNorth = await listSeasons(db, north);
    expect(forNorth.map((s) => s.year)).toEqual([2026, 2025]);
    expect(forNorth.find((s) => s.id === s2026)?.gameCount).toBe(2);
    expect(forNorth.find((s) => s.id === s2025)?.gameCount).toBe(1);
  });

  it('picks the newest season as current', async () => {
    const db = await createTestDb();
    const teamId = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    await createSeason(db, { year: 2024, teamId });
    const newest = await createSeason(db, { year: 2026, teamId });
    await createSeason(db, { year: 2025, teamId });

    expect((await currentSeason(db, teamId))?.id).toBe(newest);
  });

  it('has no current season for a team with none', async () => {
    const db = await createTestDb();
    const teamId = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    expect(await currentSeason(db, teamId)).toBeUndefined();
  });

  it('cascades a delete to its games', async () => {
    const db = await createTestDb();
    const teamId = await createTeam(db, { name: 'Northside', abbreviation: 'NSR' });
    const seasonId = await createSeason(db, { year: 2026, teamId });
    await newGame(db, seasonId, '2026-09-04');

    await deleteSeason(db, seasonId);
    expect(await listSeasons(db, teamId)).toHaveLength(0);
  });
});
