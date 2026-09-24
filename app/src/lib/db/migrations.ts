/**
 * The migration list.
 *
 * `?raw` keeps the .sql files the single source of truth — they are validated
 * directly against SQLite in the test suite rather than duplicated as strings
 * here. tests/support/testDb.ts mirrors this list, reading the same files
 * from disk.
 *
 * Written out rather than scanned from the directory: four entries is still
 * clearer read than globbed, and the order is explicit.
 */
import schemaV1 from './schema.sql?raw';
import gameCursorV2 from './002_game_cursor.sql?raw';
import possessionV3 from './003_possession.sql?raw';
import jerseyNumbersV4 from './004_jersey_numbers.sql?raw';
import defenseV5 from './005_defense.sql?raw';
import returnsV6 from './006_returns.sql?raw';
import playbookV7 from './007_playbook.sql?raw';
import passDetailV8 from './008_pass_detail.sql?raw';
import footballRulesV9 from './009_football_rules.sql?raw';
import type { Migration } from './migrate';

export const migrations: Migration[] = [
  { version: 1, name: 'initial schema', sql: schemaV1 },
  { version: 2, name: 'game cursor', sql: gameCursorV2 },
  { version: 3, name: 'possession', sql: possessionV3 },
  { version: 4, name: 'jersey numbers', sql: jerseyNumbersV4 },
  { version: 5, name: 'defense', sql: defenseV5 },
  { version: 6, name: 'returns', sql: returnsV6 },
  { version: 7, name: 'playbook', sql: playbookV7 },
  { version: 8, name: 'pass detail', sql: passDetailV8 },
  { version: 9, name: 'football rules', sql: footballRulesV9 },
];
