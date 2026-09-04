/**
 * A real SQLite database, in memory, for tests.
 *
 * Uses Node's built-in `node:sqlite`, so every report query runs against the
 * same engine that ships in the app — no mocks, no emulator, no extra
 * dependency. The sync API is wrapped to satisfy the async `Database`
 * interface the app codes against.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Database } from '../../src/lib/db/driver';
import { migrate, type Migration } from '../../src/lib/db/migrate';

const here = dirname(fileURLToPath(import.meta.url));

/** schema.sql, read from disk so it stays the single source of truth. */
export const schemaSql = readFileSync(
  join(here, '..', '..', 'src', 'lib', 'db', 'schema.sql'),
  'utf8',
);

export const testMigrations: Migration[] = [
  { version: 1, name: 'initial schema', sql: schemaSql },
];

class NodeDatabase implements Database {
  constructor(private readonly db: DatabaseSync) {}

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  async insert(sql: string, params: unknown[] = []): Promise<number> {
    const { lastInsertRowid } = this.db.prepare(sql).run(...(params as never[]));
    return Number(lastInsertRowid);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** A migrated, empty database ready for a test to populate. */
export async function createTestDb(): Promise<Database> {
  const db = new NodeDatabase(new DatabaseSync(':memory:'));
  await db.exec('PRAGMA foreign_keys = ON');
  await migrate(db, testMigrations);
  return db;
}
