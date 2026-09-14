import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import type { Database } from '../../src/lib/db/driver';

/** A team, season and game to hang snaps off. */
async function seedGame(db: Database) {
  await db.run("INSERT INTO teams (name, abbreviation) VALUES ('Test', 'TST')");
  await db.run('INSERT INTO seasons (year, team_id) VALUES (2026, 1)');
  await db.run(
    `INSERT INTO games (season_id, date, opponent, location, weather, field_condition)
     VALUES (1, '2026-09-04', 'Opponent A', 'home', 'clear', 'grass')`,
  );
}

describe('schema', () => {
  it('creates every table', async () => {
    const db = await createTestDb();
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'defense_assists',
      'games',
      'players',
      'plays',
      'quarter_scores',
      'schema_version',
      'seasons',
      'snaps',
      'teams',
    ]);
    await db.close();
  });

  it('indexes what the tracker and reports filter on', async () => {
    const db = await createTestDb();
    const indexes = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
    );
    const names = indexes.map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'idx_snaps_sequence',
        'idx_snaps_kind',
        'idx_snaps_carrier',
        'idx_snaps_qb',
        'idx_snaps_receiver',
        'idx_snaps_defender',
      ]),
    );
    await db.close();
  });

  it('rejects an unknown snap kind', async () => {
    const db = await createTestDb();
    await seedGame(db);
    await expect(
      db.run('INSERT INTO snaps (game_id, kind, sequence_number, quarter) VALUES (1, ?, 1, 1)', [
        'NONSENSE',
      ]),
    ).rejects.toThrow();
    await db.close();
  });

  it('rejects two snaps sharing a sequence number in one game', async () => {
    const db = await createTestDb();
    await seedGame(db);
    await db.run(
      "INSERT INTO snaps (game_id, kind, sequence_number, quarter) VALUES (1, 'RUN', 1, 1)",
    );
    await expect(
      db.run("INSERT INTO snaps (game_id, kind, sequence_number, quarter) VALUES (1, 'PASS', 1, 1)"),
    ).rejects.toThrow();
    await db.close();
  });

  it('cascades a deleted game to its snaps', async () => {
    const db = await createTestDb();
    await seedGame(db);
    await db.run(
      "INSERT INTO snaps (game_id, kind, sequence_number, quarter) VALUES (1, 'RUN', 1, 1)",
    );
    await db.run('DELETE FROM games WHERE id = 1');
    expect(await db.all('SELECT id FROM snaps')).toHaveLength(0);
    await db.close();
  });

  it('keeps the snap when a player on it is deleted', async () => {
    const db = await createTestDb();
    await seedGame(db);
    await db.run(
      "INSERT INTO players (team_id, first_name, last_name, position, number) VALUES (1, 'A', 'B', 'RB', 22)",
    );
    await db.run(
      "INSERT INTO snaps (game_id, kind, sequence_number, quarter, ball_carrier_id) VALUES (1, 'RUN', 1, 1, 1)",
    );
    await db.run('DELETE FROM players WHERE id = 1');
    const snap = await db.get<{ ball_carrier_id: number | null }>(
      'SELECT ball_carrier_id FROM snaps WHERE id = 1',
    );
    // The play still happened, even if the roster entry is gone.
    expect(snap?.ball_carrier_id).toBeNull();
    await db.close();
  });
});
