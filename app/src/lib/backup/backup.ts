/**
 * Taking and restoring a backup.
 *
 * This is the only protection a local-only app has: the database is one file
 * on one device, and there is no server holding a second copy. Losing the
 * phone means losing the season unless a backup exists.
 */
import type { Database } from '../db/driver';
import { currentVersion } from '../db/migrate';
import { rebuildCursor } from '../game/cursor';
import { writeGameCursor } from '../db/repositories/games';
import {
  BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION,
  type BackupDocument, type BackupTable, type Row,
} from './format';

export async function buildBackup(
  db: Database,
  appVersion = '',
): Promise<BackupDocument> {
  const tables = {} as Record<BackupTable, Row[]>;
  for (const table of BACKUP_TABLES) {
    // Table names come from a fixed list, never from input.
    tables[table] = await db.all<Row>(`SELECT * FROM ${table}`);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: await currentVersion(db),
    exportedAt: new Date().toISOString(),
    app: { name: 'sportsman', version: appVersion },
    counts: Object.fromEntries(
      BACKUP_TABLES.map((t) => [t, tables[t].length]),
    ) as Record<BackupTable, number>,
    tables,
  };
}

export interface RestoreReport {
  restored: Record<BackupTable, number>;
  total: number;
}

/**
 * Replace everything with the backup's contents.
 *
 * One transaction, so a failure leaves the existing data untouched rather
 * than half-replaced. Rows keep their ORIGINAL ids, which is what lets every
 * foreign key survive without a remapping pass.
 *
 * `PRAGMA defer_foreign_keys` rather than `foreign_keys = OFF`: the latter
 * is a no-op inside a transaction, which is the classic way to write a
 * restore that appears to work and silently drops constraint checking.
 */
export async function restoreBackup(
  db: Database,
  doc: BackupDocument,
): Promise<RestoreReport> {
  return db.transaction(async () => {
    await db.run('PRAGMA defer_foreign_keys = ON');

    // Delete children first, insert parents first.
    for (const table of [...BACKUP_TABLES].reverse()) {
      await db.run(`DELETE FROM ${table}`);
    }

    const restored = {} as Record<BackupTable, number>;
    for (const table of BACKUP_TABLES) {
      const rows = doc.tables[table];
      restored[table] = rows.length;
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        await db.run(
          `INSERT INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((c) => row[c]),
        );
      }
    }

    // A backup taken before the cursor existed, or edited by hand, can carry
    // a stale one. Rebuilding from the plays is cheap and always right.
    const games = await db.all<{ id: number }>('SELECT id FROM games');
    for (const game of games) {
      await writeGameCursor(db, game.id, await rebuildCursor(db, game.id));
    }

    return {
      restored,
      total: Object.values(restored).reduce((sum, n) => sum + n, 0),
    };
  });
}
