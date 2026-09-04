/**
 * The app's one database handle.
 *
 * Repositories all take a `Database` explicitly so they can be tested against
 * `createTestDb()`. Components should not have to thread it through props, so
 * this holds the single instance opened at boot.
 */
import type { Database } from './driver';

let db: Database | null = null;

export function setDb(instance: Database): void {
  db = instance;
}

export function getDb(): Database {
  if (!db) throw new Error('database not open: setDb() must run before any query');
  return db;
}
