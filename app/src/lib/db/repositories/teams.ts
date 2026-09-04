/**
 * Teams.
 *
 * Every function takes the database as its first argument rather than
 * reaching for a singleton — that is what lets each one run against
 * `createTestDb()` in a plain Node process.
 */
import type { Database } from '../driver';
import { type Team, toDomain, toDomainAll } from './types';

const COLUMNS = 'id, name, abbreviation, created_at, updated_at';

export interface TeamInput {
  name: string;
  abbreviation: string;
}

export interface TeamWithCount extends Team {
  playerCount: number;
}

export async function listTeams(db: Database): Promise<Team[]> {
  return toDomainAll<Team>(
    await db.all(`SELECT ${COLUMNS} FROM teams ORDER BY name`),
  );
}

/** Teams with their active roster size, for the team list screen. */
export async function listTeamsWithCounts(db: Database): Promise<TeamWithCount[]> {
  return toDomainAll<TeamWithCount>(
    await db.all(`
      SELECT t.id, t.name, t.abbreviation, t.created_at, t.updated_at,
             COUNT(p.id) AS player_count
      FROM teams t
      LEFT JOIN players p ON p.team_id = t.id AND p.is_active = 1
      GROUP BY t.id
      ORDER BY t.name
    `),
  );
}

export async function getTeam(db: Database, id: number): Promise<Team | undefined> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM teams WHERE id = ?`,
    [id],
  );
  return row && toDomain<Team>(row);
}

export async function createTeam(db: Database, input: TeamInput): Promise<number> {
  return db.insert('INSERT INTO teams (name, abbreviation) VALUES (?, ?)', [
    input.name,
    input.abbreviation,
  ]);
}

export async function updateTeam(db: Database, id: number, input: TeamInput): Promise<void> {
  await db.run(
    `UPDATE teams SET name = ?, abbreviation = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [input.name, input.abbreviation, id],
  );
}

/** Cascades to seasons, players, games and every snap of those games. */
export async function deleteTeam(db: Database, id: number): Promise<void> {
  await db.run('DELETE FROM teams WHERE id = ?', [id]);
}
