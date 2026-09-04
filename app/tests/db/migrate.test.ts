import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createTestDb, testMigrations } from '../support/testDb';
import { currentVersion, latestVersion, migrate } from '../../src/lib/db/migrate';
import type { Database } from '../../src/lib/db/driver';

/** A driver over a database with no schema at all. */
function bareDb(): Database {
  const sqlite = new DatabaseSync(':memory:');
  return {
    run: async (sql, params = []) => void sqlite.prepare(sql).run(...(params as never[])),
    exec: async (sql) => sqlite.exec(sql),
    all: async <T>(sql: string, params: unknown[] = []) =>
      sqlite.prepare(sql).all(...(params as never[])) as T[],
    get: async <T>(sql: string, params: unknown[] = []) =>
      sqlite.prepare(sql).get(...(params as never[])) as T | undefined,
    insert: async (sql, params = []) =>
      Number(sqlite.prepare(sql).run(...(params as never[])).lastInsertRowid),
    transaction: async (fn) => {
      sqlite.exec('BEGIN');
      try {
        const out = await fn();
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    close: async () => sqlite.close(),
  };
}

describe('migrate', () => {
  it('reports the latest defined version', () => {
    expect(latestVersion(testMigrations)).toBe(1);
    expect(latestVersion([])).toBe(0);
  });

  it('reports version zero before anything is applied', async () => {
    const db = bareDb();
    expect(await currentVersion(db)).toBe(0);
    await db.close();
  });

  it('applies pending migrations and records the version', async () => {
    const db = bareDb();
    expect(await migrate(db, testMigrations)).toBe(1);
    expect(await currentVersion(db)).toBe(1);
    await db.close();
  });

  it('is a no-op when already current', async () => {
    const db = await createTestDb();
    await migrate(db, testMigrations);
    await migrate(db, testMigrations);
    const applied = await db.all<{ version: number }>('SELECT version FROM schema_version');
    expect(applied.map((r) => r.version)).toEqual([1]);
    await db.close();
  });

  it('rolls back a failed migration rather than half-applying it', async () => {
    const db = bareDb();
    await expect(
      migrate(db, [
        { version: 1, name: 'broken', sql: 'CREATE TABLE ok (id INTEGER); THIS IS NOT SQL;' },
      ]),
    ).rejects.toThrow();
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    expect(tables.map((t) => t.name)).not.toContain('ok');
    await db.close();
  });
});
