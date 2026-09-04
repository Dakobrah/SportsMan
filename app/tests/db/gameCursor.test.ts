import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createTestDb, schemaSql, testMigrations } from '../support/testDb';
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

/** A game to hang a cursor on. Returns its id. */
async function seedGame(db: Database): Promise<number> {
  const team = await db.insert('INSERT INTO teams (name, abbreviation) VALUES (?, ?)', [
    'Northside',
    'NSR',
  ]);
  const season = await db.insert('INSERT INTO seasons (year, team_id) VALUES (?, ?)', [
    2026,
    team,
  ]);
  return db.insert(
    `INSERT INTO games (season_id, date, opponent, location, weather, field_condition)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [season, '2026-09-04', 'Westfield', 'home', 'clear', 'turf'],
  );
}

const cursorColumns = [
  'current_quarter',
  'current_down',
  'current_distance',
  'current_ball_position',
  'current_situation',
];

describe('migration 002: game cursor', () => {
  it('is included in the migration list', () => {
    // Derived rather than hardcoded, so adding a migration does not break a
    // test about the cursor.
    expect(latestVersion(testMigrations)).toBeGreaterThanOrEqual(2);
    expect(testMigrations.some((m) => m.name === 'game cursor')).toBe(true);
  });

  it('adds every cursor column to games', async () => {
    const db = await createTestDb();
    const columns = await db.all<{ name: string }>('PRAGMA table_info(games)');
    const names = columns.map((c) => c.name);
    for (const column of cursorColumns) expect(names).toContain(column);
  });

  it('defaults a new game to first and ten on our own 25', async () => {
    const db = await createTestDb();
    const id = await seedGame(db);

    const cursor = await db.get<{
      current_quarter: number;
      current_down: number | null;
      current_distance: number | null;
      current_ball_position: number;
      current_situation: string;
    }>(`SELECT ${cursorColumns.join(', ')} FROM games WHERE id = ?`, [id]);

    // -25 is our own 25 under the -50..+50 convention in lib/game/field.ts.
    expect(cursor).toEqual({
      current_quarter: 1,
      current_down: 1,
      current_distance: 10,
      current_ball_position: -25,
      current_situation: 'normal',
    });
  });

  it('allows a null down and distance for a dead ball', async () => {
    const db = await createTestDb();
    const id = await seedGame(db);

    // A kickoff or extra point has no down or distance.
    await db.run(
      `UPDATE games SET current_down = NULL, current_distance = NULL,
                        current_situation = 'kickoff' WHERE id = ?`,
      [id],
    );

    const row = await db.get<{ current_down: number | null; current_situation: string }>(
      'SELECT current_down, current_situation FROM games WHERE id = ?',
      [id],
    );
    expect(row?.current_down).toBeNull();
    expect(row?.current_situation).toBe('kickoff');
  });

  it('rejects a situation outside the Situation union', async () => {
    const db = await createTestDb();
    const id = await seedGame(db);

    await expect(
      db.run("UPDATE games SET current_situation = 'halftime' WHERE id = ?", [id]),
    ).rejects.toThrow();
  });

  it('migrates a v1 database forward to latest without losing rows', async () => {
    const db = bareDb();

    // Bring it up to v1 only, then put a game in it.
    await migrate(db, [{ version: 1, name: 'initial schema', sql: schemaSql }]);
    expect(await currentVersion(db)).toBe(1);
    const id = await seedGame(db);

    await migrate(db, testMigrations);
    expect(await currentVersion(db)).toBe(latestVersion(testMigrations));

    const row = await db.get<{ opponent: string; current_ball_position: number }>(
      'SELECT opponent, current_ball_position FROM games WHERE id = ?',
      [id],
    );
    expect(row?.opponent).toBe('Westfield');
    // The pre-existing row picks up the column default.
    expect(row?.current_ball_position).toBe(-25);
  });
});
