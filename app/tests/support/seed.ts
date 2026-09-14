/** Fixtures shared by the repository tests. */
import type { Database } from '../../src/lib/db/driver';
import { createTeam } from '../../src/lib/db/repositories/teams';
import { createSeason } from '../../src/lib/db/repositories/seasons';
import { createPlayer } from '../../src/lib/db/repositories/players';
import { createGame } from '../../src/lib/db/repositories/games';
import { rosterForGame } from '../../src/lib/db/repositories/players';
import type { Player, Position } from '../../src/lib/db/repositories/types';

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

/** Jersey numbers on the seeded roster. Forms take the number, not an id. */
export const JERSEY = { rb: 22, qb: 7, wr: 81, k: 3 } as const;

export interface SeededRoster extends Seeded {
  db: Database;
  rb: number;
  qb: number;
  wr: number;
  k: number;
  roster: Player[];
}

/**
 * A game with a four-player roster, which is what every test that records a
 * play needs. Four near-identical copies of this had accumulated.
 */
export async function seedRoster(db: Database): Promise<SeededRoster> {
  const seeded = await seedGame(db);
  const { teamId, gameId } = seeded;
  const rb = await seedPlayer(db, teamId, { lastName: 'Danforth', position: 'RB', number: JERSEY.rb });
  const qb = await seedPlayer(db, teamId, { lastName: 'Okafor', position: 'QB', number: JERSEY.qb });
  const wr = await seedPlayer(db, teamId, { lastName: 'Vance', position: 'WR', number: JERSEY.wr });
  const k = await seedPlayer(db, teamId, { lastName: 'Bell', position: 'K', number: JERSEY.k });
  return { ...seeded, db, rb, qb, wr, k, roster: await rosterForGame(db, gameId) };
}

