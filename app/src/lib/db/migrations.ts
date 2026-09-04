/**
 * The migration list.
 *
 * `?raw` keeps schema.sql the single source of truth — it is validated
 * directly against SQLite in the test suite rather than duplicated as a
 * string here.
 */
import schemaV1 from './schema.sql?raw';
import type { Migration } from './migrate';

export const migrations: Migration[] = [
  { version: 1, name: 'initial schema', sql: schemaV1 },
];
