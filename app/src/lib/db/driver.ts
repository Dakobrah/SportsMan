/**
 * The database interface the rest of the app talks to.
 *
 * Deliberately tiny — four verbs and a transaction. Everything above this
 * line is plain SQL, which keeps the report queries readable next to the
 * Django ORM calls they were ported from.
 *
 * Two implementations exist: `db/tauri.ts` on device (one rusqlite
 * connection behind a Mutex, in src-tauri/src/db.rs), and `node:sqlite` in
 * tests. That is the point of the abstraction — every report query is
 * exercised against a real SQLite engine in a plain Node process, with no
 * emulator and no build step.
 */
export interface Database {
  /** Run a statement for its effect. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Run a script of several statements. */
  exec(sql: string): Promise<void>;
  /** Every matching row. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** The first matching row, if any. */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Insert a row and return its new id. */
  insert(sql: string, params?: unknown[]): Promise<number>;
  /** Run `fn` in a transaction, rolling back if it throws. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
