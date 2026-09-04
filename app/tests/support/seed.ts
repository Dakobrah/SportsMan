/** Fixtures shared by the repository tests. */
import type { Database } from '../../src/lib/db/driver';
import { createTeam } from '../../src/lib/db/repositories/teams';
import { createSeason } from '../../src/lib/db/repositories/seasons';
import { createPlayer } from '../../src/lib/db/repositories/players';
import { createGame } from '../../src/lib/db/repositories/games';
import type { Position } from '../../src/lib/db/repositories/types';

export interface Seeded {
  teamId: number;
  seasonId: number;
  gameId: number;
}

/** A team with one season and one game, ready for plays. */
export async function seedGame(db: Database): Promise<Seeded> {
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
  return { teamId, seasonId, gameId };
}

export async function seedPlayer(
  db: Database,
  teamId: number,
  overrides: Partial<{ firstName: string; lastName: string; position: Position; number: number; isActive: boolean }> = {},
): Promise<number> {
  return createPlayer(db, {
    teamId,
    firstName: overrides.firstName ?? 'Alex',
    lastName: overrides.lastName ?? 'Rivera',
    position: overrides.position ?? 'RB',
    number: overrides.number ?? 22,
    isActive: overrides.isActive ?? true,
  });
}
