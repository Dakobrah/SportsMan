/**
 * The on-device database.
 *
 * Capacitor SQLite gives a native SQLite on Android and iOS, and a wasm build
 * backed by IndexedDB on the web. The same SQL runs on all three, and on
 * `node:sqlite` in tests — see tests/support/testDb.ts for that counterpart.
 */
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type { Database } from './driver';
import { migrate } from './migrate';
import { migrations } from './migrations';

const DATABASE_NAME = 'sportsman';

class CapacitorDatabase implements Database {
  constructor(private readonly db: SQLiteDBConnection) {}

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.db.run(sql, params as never[]);
  }

  async exec(sql: string): Promise<void> {
    await this.db.execute(sql);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { values } = await this.db.query(sql, params as never[]);
    return (values ?? []) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async insert(sql: string, params: unknown[] = []): Promise<number> {
    const result = await this.db.run(sql, params as never[]);
    const id = result.changes?.lastId;
    if (id == null) throw new Error(`insert did not return an id: ${sql}`);
    return id;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.db.execute('BEGIN');
    try {
      const result = await fn();
      await this.db.execute('COMMIT');
      return result;
    } catch (error) {
      await this.db.execute('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

let opened: Database | null = null;

/**
 * Open the database, creating and migrating it on first run.
 *
 * Idempotent: repeated calls return the same connection, so a component can
 * ask for the database without coordinating with whatever opened it first.
 */
export async function openDatabase(): Promise<Database> {
  if (opened) return opened;

  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // The web build keeps its data in IndexedDB behind a wasm SQLite, and needs
  // the store initialised before any connection is opened.
  if (Capacitor.getPlatform() === 'web') {
    await sqlite.initWebStore();
  }

  const existing = (await sqlite.isConnection(DATABASE_NAME, false)).result;
  const connection = existing
    ? await sqlite.retrieveConnection(DATABASE_NAME, false)
    : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);

  await connection.open();

  const db = new CapacitorDatabase(connection);
  await db.exec('PRAGMA foreign_keys = ON');
  await migrate(db, migrations);

  opened = db;
  return db;
}

/** Release the connection. Mainly for tests and teardown. */
export async function closeDatabase(): Promise<void> {
  if (!opened) return;
  await opened.close();
  opened = null;
}
