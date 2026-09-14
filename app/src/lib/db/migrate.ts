/**
 * Schema versioning.
 *
 * Migrations are an ordered list; each runs once, in a transaction, and the
 * version is recorded. Adding a migration means appending to the array — the
 * runner does not need to change.
 */
import type { Database } from './driver';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** The current schema version, i.e. the highest migration defined. */
export const latestVersion = (migrations: Migration[]): number =>
  migrations.reduce((max, m) => Math.max(max, m.version), 0);

export async function currentVersion(db: Database): Promise<number> {
  // The table itself only exists once the first migration has run.
  const table = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
  );
  if (!table) return 0;

  const row = await db.get<{ version: number }>(
    'SELECT MAX(version) AS version FROM schema_version',
  );
  return row?.version ?? 0;
}

/**
 * Bring the database up to the latest schema. Safe to call on every start:
 * migrations already applied are skipped.
 */
export async function migrate(db: Database, migrations: Migration[]): Promise<number> {
  const from = await currentVersion(db);
  const pending = migrations
    .filter((m) => m.version > from)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.run('INSERT INTO schema_version (version) VALUES (?)', [migration.version]);
    });
  }

  return latestVersion(migrations);
}
