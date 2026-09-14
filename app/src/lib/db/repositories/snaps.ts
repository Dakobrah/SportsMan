/**
 * Snaps — every recorded play, of every kind, in one table.
 *
 * Django modelled these with multi-table inheritance (BaseSnap -> OffenseSnap
 * -> RunPlay, each its own table joined by pointer). schema.sql flattens that
 * into one row with a `kind` discriminator, so reading a game's plays is a
 * single-table scan and every report is a single-table aggregate.
 */
import type { Database } from '../driver';
import {
  BOOLEAN_COLUMNS,
  type AssistType,
  type DefenseAssist,
  type Snap,
  snake,
  toDomain,
  toDomainAll,
} from './types';

const BOOLS = BOOLEAN_COLUMNS.snaps;

/**
 * A snap to be written. `kind` and `quarter` are always required; everything
 * else is optional and interpreted against the kind. `sequence_number` is
 * deliberately absent — only the database allocates it.
 */
export type NewSnap = Partial<
  Omit<Snap, 'id' | 'gameId' | 'sequenceNumber' | 'createdAt' | 'updatedAt'>
> &
  Pick<Snap, 'kind' | 'quarter'>;

export interface SnapFilter {
  quarter?: number;
  kind?: Snap['kind'];
  limit?: number;
  order?: 'asc' | 'desc';
}

/**
 * Insert a snap, letting SQLite allocate the sequence number.
 *
 * Django read `MAX(sequence_number)` and then inserted as two statements
 * (apps/frontend/tracker.py:39), leaving a window a rapid double-tap could
 * walk into. Computing it in the INSERT closes that: the subselect runs
 * under the same write lock as the insert. `UNIQUE (game_id,
 * sequence_number)` is the backstop — a collision raises rather than
 * silently reordering a game.
 */
export async function insertSnap(
  db: Database,
  gameId: number,
  snap: NewSnap,
): Promise<{ id: number; sequenceNumber: number }> {
  const entries = Object.entries(snap).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => snake(key));
  const values = entries.map(([, value]) =>
    typeof value === 'boolean' ? (value ? 1 : 0) : value,
  );

  const id = await db.insert(
    `INSERT INTO snaps (game_id, sequence_number${columns.length ? `, ${columns.join(', ')}` : ''})
     VALUES (
       ?,
       (SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM snaps WHERE game_id = ?)
       ${columns.length ? `, ${columns.map(() => '?').join(', ')}` : ''}
     )`,
    [gameId, gameId, ...values],
  );

  const row = await db.get<{ sequence_number: number }>(
    'SELECT sequence_number FROM snaps WHERE id = ?',
    [id],
  );
  return { id, sequenceNumber: row?.sequence_number ?? 0 };
}

/** The next sequence number a snap would get. For display only — never bind
 *  this into an INSERT, or the race above comes back. */
export async function nextSequenceNumber(db: Database, gameId: number): Promise<number> {
  const row = await db.get<{ next: number }>(
    'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM snaps WHERE game_id = ?',
    [gameId],
  );
  return row?.next ?? 1;
}

export async function listSnaps(
  db: Database,
  gameId: number,
  filter: SnapFilter = {},
): Promise<Snap[]> {
  const where = ['game_id = ?'];
  const params: unknown[] = [gameId];

  if (filter.quarter != null) {
    where.push('quarter = ?');
    params.push(filter.quarter);
  }
  if (filter.kind) {
    where.push('kind = ?');
    params.push(filter.kind);
  }

  let sql = `SELECT * FROM snaps WHERE ${where.join(' AND ')}
             ORDER BY sequence_number ${filter.order === 'desc' ? 'DESC' : 'ASC'}`;
  if (filter.limit != null) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return toDomainAll<Snap>(await db.all(sql, params), BOOLS);
}

/** The most recent play of a game — what undo removes and what the cursor is
 *  rebuilt from. */
export async function lastSnap(db: Database, gameId: number): Promise<Snap | undefined> {
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM snaps WHERE game_id = ? ORDER BY sequence_number DESC LIMIT 1',
    [gameId],
  );
  return row && toDomain<Snap>(row, BOOLS);
}

export async function getSnap(db: Database, id: number): Promise<Snap | undefined> {
  const row = await db.get<Record<string, unknown>>('SELECT * FROM snaps WHERE id = ?', [id]);
  return row && toDomain<Snap>(row, BOOLS);
}

export async function deleteSnap(db: Database, id: number): Promise<void> {
  await db.run('DELETE FROM snaps WHERE id = ?', [id]);
}

export async function countSnaps(db: Database, gameId: number): Promise<number> {
  const row = await db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM snaps WHERE game_id = ?',
    [gameId],
  );
  return row?.n ?? 0;
}

export async function listAssists(db: Database, snapId: number): Promise<DefenseAssist[]> {
  return toDomainAll<DefenseAssist>(
    await db.all(
      'SELECT id, snap_id, player_id, assist_type FROM defense_assists WHERE snap_id = ?',
      [snapId],
    ),
  );
}

export async function addAssist(
  db: Database,
  snapId: number,
  playerId: number,
  assistType: AssistType,
): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO defense_assists (snap_id, player_id, assist_type)
     VALUES (?, ?, ?)`,
    [snapId, playerId, assistType],
  );
}
