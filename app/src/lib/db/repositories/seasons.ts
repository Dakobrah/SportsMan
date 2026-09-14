/** Seasons. A season is a (year, team) pair; the schema enforces uniqueness. */
import type { Database } from '../driver';
import { type Season, toDomain, toDomainAll } from './types';

const COLUMNS = 'id, year, team_id, created_at, updated_at';

export interface SeasonInput {
  year: number;
  teamId: number;
}

export interface SeasonWithCount extends Season {
  gameCount: number;
}

export async function listSeasons(
  db: Database,
  teamId?: number,
): Promise<SeasonWithCount[]> {
  const where = teamId == null ? '' : 'WHERE s.team_id = ?';
  return toDomainAll<SeasonWithCount>(
    await db.all(
      `SELECT s.id, s.year, s.team_id, s.created_at, s.updated_at,
              COUNT(g.id) AS game_count
       FROM seasons s
       LEFT JOIN games g ON g.season_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.year DESC`,
      teamId == null ? [] : [teamId],
    ),
  );
}

export async function getSeason(db: Database, id: number): Promise<Season | undefined> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM seasons WHERE id = ?`,
    [id],
  );
  return row && toDomain<Season>(row);
}

/** The newest season for a team — what the home screen defaults to. */
export async function currentSeason(
  db: Database,
  teamId: number,
): Promise<Season | undefined> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM seasons WHERE team_id = ? ORDER BY year DESC LIMIT 1`,
    [teamId],
  );
  return row && toDomain<Season>(row);
}

export async function createSeason(db: Database, input: SeasonInput): Promise<number> {
  return db.insert('INSERT INTO seasons (year, team_id) VALUES (?, ?)', [
    input.year,
    input.teamId,
  ]);
}

export async function deleteSeason(db: Database, id: number): Promise<void> {
  await db.run('DELETE FROM seasons WHERE id = ?', [id]);
}
