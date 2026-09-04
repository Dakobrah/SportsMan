/** Games, their quarter scores, and the live tracker cursor. */
import type { Database } from '../driver';
import type { GameCursor } from '../../game/cursor';
import {
  BOOLEAN_COLUMNS,
  type FieldCondition,
  type Game,
  type Location,
  type QuarterScore,
  type Season,
  type Situation,
  type Team,
  type Weather,
  toDomain,
  toDomainAll,
} from './types';

const COLUMNS = `id, season_id, date, opponent, location, weather, field_condition,
                 team_score, opponent_score, notes,
                 current_quarter, current_down, current_distance,
                 current_ball_position, current_situation,
                 current_possession, sides_swapped,
                 created_at, updated_at`;

export interface GameInput {
  seasonId: number;
  date: string;
  opponent: string;
  location: Location;
  weather: Weather;
  fieldCondition: FieldCondition;
  teamScore?: number;
  opponentScore?: number;
  notes?: string;
}

export type GameResult = 'W' | 'L' | 'T';

export interface GameFilter {
  seasonId?: number;
  result?: GameResult;
  location?: Location;
}

export type { GameCursor };

export interface GameListItem extends Game {
  snapCount: number;
}

const RESULT_PREDICATE: Record<GameResult, string> = {
  W: 'team_score > opponent_score',
  L: 'team_score < opponent_score',
  T: 'team_score = opponent_score',
};

export async function listGames(
  db: Database,
  filter: GameFilter = {},
): Promise<GameListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.seasonId != null) {
    where.push('g.season_id = ?');
    params.push(filter.seasonId);
  }
  if (filter.result) where.push(`g.${RESULT_PREDICATE[filter.result]}`);
  if (filter.location) {
    where.push('g.location = ?');
    params.push(filter.location);
  }

  const columns = COLUMNS.split(',')
    .map((c) => `g.${c.trim()}`)
    .join(', ');

  return toDomainAll<GameListItem>(
    await db.all(
      `SELECT ${columns}, COUNT(s.id) AS snap_count
       FROM games g
       LEFT JOIN snaps s ON s.game_id = g.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY g.id
       ORDER BY g.date DESC`,
      params,
    ),
    BOOLEAN_COLUMNS.games,
  );
}

export async function getGame(db: Database, id: number): Promise<Game | undefined> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM games WHERE id = ?`,
    [id],
  );
  return row && toDomain<Game>(row, BOOLEAN_COLUMNS.games);
}

/**
 * A game with the season and team it belongs to — the tracker needs all
 * three to render its scoreboard. Replaces Django's `select_related`.
 */
export async function getGameContext(
  db: Database,
  id: number,
): Promise<{ game: Game; season: Season; team: Team } | undefined> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT g.id, g.season_id, g.date, g.opponent, g.location, g.weather,
            g.field_condition, g.team_score, g.opponent_score, g.notes,
            g.current_quarter, g.current_down, g.current_distance,
            g.current_ball_position, g.current_situation,
            g.current_possession, g.sides_swapped,
            g.created_at, g.updated_at,
            s.id AS s_id, s.year AS s_year, s.team_id AS s_team_id,
            s.created_at AS s_created_at, s.updated_at AS s_updated_at,
            t.id AS t_id, t.name AS t_name, t.abbreviation AS t_abbreviation,
            t.created_at AS t_created_at, t.updated_at AS t_updated_at
     FROM games g
     JOIN seasons s ON s.id = g.season_id
     JOIN teams   t ON t.id = s.team_id
     WHERE g.id = ?`,
    [id],
  );
  if (!row) return undefined;

  const split = (prefix: string) => {
    const out: Record<string, unknown> = {};
    for (const key in row) {
      if (key.startsWith(prefix)) out[key.slice(prefix.length)] = row[key];
    }
    return out;
  };
  const game: Record<string, unknown> = {};
  for (const key in row) {
    if (!key.startsWith('s_') && !key.startsWith('t_')) game[key] = row[key];
  }

  return {
    game: toDomain<Game>(game, BOOLEAN_COLUMNS.games),
    season: toDomain<Season>(split('s_')),
    team: toDomain<Team>(split('t_')),
  };
}

export async function createGame(db: Database, input: GameInput): Promise<number> {
  return db.insert(
    `INSERT INTO games (season_id, date, opponent, location, weather, field_condition,
                        team_score, opponent_score, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.seasonId,
      input.date,
      input.opponent,
      input.location,
      input.weather,
      input.fieldCondition,
      input.teamScore ?? 0,
      input.opponentScore ?? 0,
      input.notes ?? '',
    ],
  );
}

export async function updateGame(
  db: Database,
  id: number,
  input: GameInput,
): Promise<void> {
  await db.run(
    `UPDATE games
     SET season_id = ?, date = ?, opponent = ?, location = ?, weather = ?,
         field_condition = ?, team_score = ?, opponent_score = ?, notes = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.seasonId,
      input.date,
      input.opponent,
      input.location,
      input.weather,
      input.fieldCondition,
      input.teamScore ?? 0,
      input.opponentScore ?? 0,
      input.notes ?? '',
      id,
    ],
  );
}

export async function deleteGame(db: Database, id: number): Promise<void> {
  await db.run('DELETE FROM games WHERE id = ?', [id]);
}

/** Set either score outright — the scoreboard's tap-to-edit. */
export async function setScores(
  db: Database,
  id: number,
  scores: { teamScore?: number; opponentScore?: number },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (scores.teamScore != null) {
    sets.push('team_score = ?');
    params.push(Math.max(0, scores.teamScore));
  }
  if (scores.opponentScore != null) {
    sets.push('opponent_score = ?');
    params.push(Math.max(0, scores.opponentScore));
  }
  if (!sets.length) return;

  params.push(id);
  await db.run(
    `UPDATE games SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    params,
  );
}

/**
 * Apply a scoring play, or reverse one on undo. Clamped at zero, matching
 * Django. Note that after a manual score edit the clamp can make an undo
 * diverge from the score the plays imply — acceptable, since the coach's
 * manual value is the authoritative one.
 */
export async function addToTeamScore(
  db: Database,
  id: number,
  delta: number,
): Promise<number> {
  await db.run(
    `UPDATE games SET team_score = MAX(0, team_score + ?),
                      updated_at = datetime('now')
     WHERE id = ?`,
    [delta, id],
  );
  const row = await db.get<{ team_score: number }>(
    'SELECT team_score FROM games WHERE id = ?',
    [id],
  );
  return row?.team_score ?? 0;
}

export async function listQuarterScores(
  db: Database,
  gameId: number,
): Promise<QuarterScore[]> {
  return toDomainAll<QuarterScore>(
    await db.all(
      `SELECT id, game_id, quarter, team_score, opponent_score
       FROM quarter_scores WHERE game_id = ? ORDER BY quarter`,
      [gameId],
    ),
  );
}

export async function upsertQuarterScore(
  db: Database,
  gameId: number,
  quarter: number,
  scores: { teamScore: number; opponentScore: number },
): Promise<void> {
  await db.run(
    `INSERT INTO quarter_scores (game_id, quarter, team_score, opponent_score)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (game_id, quarter)
     DO UPDATE SET team_score = excluded.team_score,
                   opponent_score = excluded.opponent_score`,
    [gameId, quarter, scores.teamScore, scores.opponentScore],
  );
}

export async function readGameCursor(
  db: Database,
  gameId: number,
): Promise<GameCursor | undefined> {
  const row = await db.get<{
    current_quarter: number;
    current_down: number | null;
    current_distance: number | null;
    current_ball_position: number;
    current_situation: Situation;
    current_possession: 'us' | 'them';
  }>(
    `SELECT current_quarter, current_down, current_distance,
            current_ball_position, current_situation, current_possession
     FROM games WHERE id = ?`,
    [gameId],
  );
  if (!row) return undefined;
  return {
    quarter: row.current_quarter,
    down: row.current_down,
    distance: row.current_distance,
    ballPosition: row.current_ball_position,
    situation: row.current_situation,
    possession: row.current_possession,
  };
}

export async function writeGameCursor(
  db: Database,
  gameId: number,
  cursor: GameCursor,
): Promise<void> {
  await db.run(
    `UPDATE games
     SET current_quarter = ?, current_down = ?, current_distance = ?,
         current_ball_position = ?, current_situation = ?,
         current_possession = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      cursor.quarter,
      cursor.down,
      cursor.distance,
      cursor.ballPosition,
      cursor.situation,
      cursor.possession,
      gameId,
    ],
  );
}

/**
 * Which way round to draw the field. Teams change ends at halftime; this is
 * presentation only and changes no stored coordinate.
 */
export async function setSidesSwapped(
  db: Database,
  gameId: number,
  swapped: boolean,
): Promise<void> {
  await db.run(
    `UPDATE games SET sides_swapped = ?, updated_at = datetime('now') WHERE id = ?`,
    [swapped ? 1 : 0, gameId],
  );
}
