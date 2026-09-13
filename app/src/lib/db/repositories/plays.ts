/**
 * The playbook.
 *
 * A play is a formation plus a name plus a unit; the unique index on those
 * three is what makes an import idempotent.
 */
import type { Database } from '../driver';
import { type Play, type UnitType, toDomainAll } from './types';

const COLUMNS = 'id, name, unit_type, formation, description';

export interface PlayInput {
  unitType: UnitType;
  formation: string;
  name: string;
  description?: string;
}

export async function listPlays(db: Database, unitType?: UnitType): Promise<Play[]> {
  const where = unitType ? 'WHERE unit_type = ?' : '';
  return toDomainAll<Play>(
    await db.all(
      `SELECT ${COLUMNS} FROM plays ${where} ORDER BY unit_type, formation, name`,
      unitType ? [unitType] : [],
    ),
  );
}

/** The distinct formations in use, per unit. Drives the tracker's picker. */
export async function listFormations(db: Database, unitType: UnitType): Promise<string[]> {
  const rows = await db.all<{ formation: string }>(
    `SELECT DISTINCT formation FROM plays
     WHERE unit_type = ? AND formation <> '' ORDER BY formation`,
    [unitType],
  );
  return rows.map((row) => row.formation);
}

export async function createPlay(db: Database, input: PlayInput): Promise<number> {
  return db.insert(
    'INSERT INTO plays (unit_type, formation, name, description) VALUES (?, ?, ?, ?)',
    [input.unitType, input.formation, input.name, input.description ?? ''],
  );
}

export async function deletePlay(db: Database, id: number): Promise<void> {
  // snaps.play_id is ON DELETE SET NULL, and the snap keeps its formation
  // text, so a recorded game survives a playbook edit.
  await db.run('DELETE FROM plays WHERE id = ?', [id]);
}

export async function countPlays(db: Database): Promise<number> {
  const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM plays');
  return row?.n ?? 0;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

/**
 * Add plays, ignoring ones already in the book.
 *
 * `INSERT OR IGNORE` against the unique index, so importing the same
 * playbook twice is a no-op rather than a duplicate. Runs in one
 * transaction: a partial playbook is worse than none.
 */
export async function importPlays(
  db: Database,
  plays: PlayInput[],
): Promise<ImportResult> {
  return db.transaction(async () => {
    const before = await countPlays(db);
    for (const play of plays) {
      await db.run(
        `INSERT OR IGNORE INTO plays (unit_type, formation, name, description)
         VALUES (?, ?, ?, ?)`,
        [play.unitType, play.formation, play.name, play.description ?? ''],
      );
    }
    const added = (await countPlays(db)) - before;
    return { added, skipped: plays.length - added };
  });
}

/** Empty the playbook. Recorded games keep their formation text. */
export async function clearPlays(db: Database): Promise<void> {
  await db.run('DELETE FROM plays');
}
