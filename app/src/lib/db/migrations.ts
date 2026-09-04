/**
 * The migration list.
 *
 * `?raw` keeps the .sql files the single source of truth — they are validated
 * directly against SQLite in the test suite rather than duplicated as strings
 * here. tests/support/testDb.ts mirrors this list, reading the same files
 * from disk.
 *
 * At three entries this is still clearer written out than scanned from the
 * directory; revisit that when it reaches four.
 */
import schemaV1 from './schema.sql?raw';
import gameCursorV2 from './002_game_cursor.sql?raw';
import type { Migration } from './migrate';

export const migrations: Migration[] = [
  { version: 1, name: 'initial schema', sql: schemaV1 },
  { version: 2, name: 'game cursor', sql: gameCursorV2 },
];
