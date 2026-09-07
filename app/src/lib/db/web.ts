/**
 * The browser database, for the playable demo.
 *
 * A third implementation of the same `Database` interface that the Tauri
 * driver and the test harness satisfy -- which is the whole reason that
 * abstraction exists. The app above this line does not change at all.
 *
 * sql.js is SQLite compiled to WebAssembly, so the demo runs the same SQL
 * and the same migrations as the shipping app. It is IN MEMORY on purpose:
 * every visit starts from the seeded game, nothing is written to the
 * visitor's device, and there is nothing to clear afterwards.
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
// Imported as a URL rather than copied into the output by name. Vite resolves
// `sql.js` through its `browser` export condition, so the module that loads is
// sql-wasm-browser.js and the binary it wants is sql-wasm-browser.wasm -- not
// the sql-wasm.wasm the package's `main` implies. Naming the file here keeps
// the two halves in one place, and lets Vite hash and emit it like any asset.
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import type { Database } from './driver';
import { migrate } from './migrate';
import { migrations } from './migrations';

class WebDatabase implements Database {
  constructor(private readonly db: SqlJsDatabase) {}

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.run(sql, params as never[]);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params as never[]);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(sql, params))[0];
  }

  async insert(sql: string, params: unknown[] = []): Promise<number> {
    this.db.run(sql, params as never[]);
    const row = await this.get<{ id: number }>('SELECT last_insert_rowid() AS id');
    return row?.id ?? 0;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.run('BEGIN');
    try {
      const result = await fn();
      this.db.run('COMMIT');
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

let opened: Database | null = null;

/**
 * Open an in-memory database and migrate it.
 *
 * `wasmUrl` is emitted by Vite under the build's own base, which is relative,
 * so a demo published under a versioned path fetches its own copy of the
 * binary rather than a shared one.
 */
export async function openWebDatabase(): Promise<Database> {
  if (opened) return opened;

  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new WebDatabase(new SQL.Database());
  await db.exec('PRAGMA foreign_keys = ON');
  await migrate(db, migrations);

  opened = db;
  return db;
}

export async function closeWebDatabase(): Promise<void> {
  if (!opened) return;
  await opened.close();
  opened = null;
}
