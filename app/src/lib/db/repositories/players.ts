/** Players. */
import type { Database } from '../driver';
import { BOOLEAN_COLUMNS, type Player, type Position, flag, toDomain, toDomainAll } from './types';

const COLUMNS =
  'id, team_id, first_name, last_name, position, number, is_active, created_at, updated_at';

const BOOLS = BOOLEAN_COLUMNS.players;

const PLAYER_COLUMNS_PREFIXED = COLUMNS.split(', ')
  .map((c) => `p.${c}`)
  .join(', ');

export interface PlayerInput {
  teamId: number;
  firstName: string;
  lastName: string;
  position: Position;
  number: number;
  isActive?: boolean;
}

export interface PlayerFilter {
  teamId?: number;
  position?: Position;
  activeOnly?: boolean;
  /** Matches first name, last name, or jersey number. */
  search?: string;
}

/**
 * Every column of `snaps` that points at a player. Used to decide whether a
 * player can be deleted outright without stripping attribution from plays
 * that already happened.
 */
const PLAYER_REFERENCES = [
  'ball_carrier_id',
  'quarterback_id',
  'target_id',
  'receiver_id',
  'fumble_recovered_by_id',
  'primary_player_id',
  'kicker_id',
  'holder_id',
  'punter_id',
  'passer_id',
  'penalty_player_id',
] as const;

export async function listPlayers(
  db: Database,
  filter: PlayerFilter = {},
): Promise<Player[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.teamId != null) {
    where.push('team_id = ?');
    params.push(filter.teamId);
  }
  if (filter.position) {
    where.push('position = ?');
    params.push(filter.position);
  }
  if (filter.activeOnly) where.push('is_active = 1');
  if (filter.search?.trim()) {
    where.push('(first_name LIKE ? OR last_name LIKE ? OR CAST(number AS TEXT) LIKE ?)');
    const like = `%${filter.search.trim()}%`;
    params.push(like, like, like);
  }

  return toDomainAll<Player>(
    await db.all(
      `SELECT ${COLUMNS} FROM players
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY number, last_name`,
      params,
    ),
    BOOLS,
  );
}

/**
 * The active roster for a game's team, in jersey order.
 *
 * This is what the tracker loads once at open. Django injected the same list
 * into the page as a JSON blob and then re-queried it on every play to
 * validate the submitted player ids; here the list is passed to
 * `validatePlayers` as data, so that round trip disappears.
 */
export async function rosterForGame(db: Database, gameId: number): Promise<Player[]> {
  return toDomainAll<Player>(
    await db.all(
      `SELECT ${PLAYER_COLUMNS_PREFIXED} FROM players p
       JOIN seasons s ON s.team_id = p.team_id
       JOIN games   g ON g.season_id = s.id
       WHERE g.id = ? AND p.is_active = 1
       ORDER BY p.number`,
      [gameId],
    ),
    BOOLS,
  );
}

export async function getPlayer(db: Database, id: number): Promise<Player | undefined> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM players WHERE id = ?`,
    [id],
  );
  return row && toDomain<Player>(row, BOOLS);
}

export async function createPlayer(db: Database, input: PlayerInput): Promise<number> {
  return db.insert(
    `INSERT INTO players (team_id, first_name, last_name, position, number, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.teamId,
      input.firstName,
      input.lastName,
      input.position,
      input.number,
      flag(input.isActive ?? true),
    ],
  );
}

export async function updatePlayer(
  db: Database,
  id: number,
  input: PlayerInput,
): Promise<void> {
  await db.run(
    `UPDATE players
     SET team_id = ?, first_name = ?, last_name = ?, position = ?, number = ?,
         is_active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.teamId,
      input.firstName,
      input.lastName,
      input.position,
      input.number,
      flag(input.isActive ?? true),
      id,
    ],
  );
}

/**
 * Retiring a player. This is what the UI should offer instead of a delete:
 * every player FK on `snaps` is ON DELETE SET NULL, so a real delete silently
 * strips the ball carrier off plays that already happened.
 */
export async function setPlayerActive(
  db: Database,
  id: number,
  active: boolean,
): Promise<void> {
  await db.run(
    `UPDATE players SET is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    [flag(active), id],
  );
}

/** How many recorded plays reference this player, assists included. */
export async function playerSnapCount(db: Database, id: number): Promise<number> {
  const matches = PLAYER_REFERENCES.map((column) => `${column} = ?`).join(' OR ');
  const row = await db.get<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM snaps WHERE ${matches})
          + (SELECT COUNT(*) FROM defense_assists WHERE player_id = ?) AS n`,
    [...PLAYER_REFERENCES.map(() => id), id],
  );
  return row?.n ?? 0;
}

/**
 * Only safe when the player appears on no play. Callers should check
 * `playerSnapCount` first and fall back to `setPlayerActive(false)`.
 */
export async function deletePlayer(db: Database, id: number): Promise<void> {
  await db.run('DELETE FROM players WHERE id = ?', [id]);
}
