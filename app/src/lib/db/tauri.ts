/**
 * The on-device database, over this app's own Rust commands.
 *
 * Not `tauri-plugin-sql`: that routes every call through an sqlx connection
 * pool, so `BEGIN` and `COMMIT` can land on different connections and a
 * rollback silently does nothing (tauri-apps/plugins-workspace#886, open).
 * `recordPlay` needs the snap insert, the score update and the cursor write
 * to be one atomic unit, so instead src-tauri/src/db.rs holds a single
 * rusqlite connection behind a Mutex. See the counterpart in
 * tests/support/testDb.ts, which runs the same SQL on `node:sqlite`.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Database } from './driver';
import { migrate } from './migrate';
import { migrations } from './migrations';

class TauriDatabase implements Database {
  /**
   * Held for the duration of a transaction. The Rust side has exactly one
   * connection, so two overlapping transactions would interleave their
   * statements on it; this makes them queue instead. Plain reads and writes
   * outside a transaction need no lock — each is a single autocommit
   * statement.
   */
  private lock: Promise<void> | null = null;
  private depth = 0;

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await invoke<number>('db_run', { sql, params });
  }

  async exec(sql: string): Promise<void> {
    await invoke<null>('db_exec', { sql });
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return invoke<T[]>('db_select', { sql, params });
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async insert(sql: string, params: unknown[] = []): Promise<number> {
    return invoke<number>('db_insert', { sql, params });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // A nested call joins the transaction already in progress rather than
    // deadlocking on the lock its own caller holds.
    if (this.depth > 0) return fn();

    while (this.lock) await this.lock;

    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.depth = 1;

    try {
      await this.exec('BEGIN');
      try {
        const result = await fn();
        await this.exec('COMMIT');
        return result;
      } catch (error) {
        await this.exec('ROLLBACK');
        throw error;
      }
    } finally {
      this.depth = 0;
      this.lock = null;
      release();
    }
  }

  async close(): Promise<void> {
    // The connection is owned by the Rust side and lives as long as the app.
  }
}

let opened: Database | null = null;

/**
 * Open the database, migrating it on first run.
 *
 * Idempotent: repeated calls return the same instance, so a component can ask
 * for the database without coordinating with whatever opened it first.
 */
export async function openDatabase(): Promise<Database> {
  if (opened) return opened;

  const db = new TauriDatabase();
  await migrate(db, migrations);

  opened = db;
  return db;
}

/** Release the handle. Mainly for tests and teardown. */
export async function closeDatabase(): Promise<void> {
  if (!opened) return;
  await opened.close();
  opened = null;
}
