/**
 * Backup and restore.
 *
 * The failure this guards against is total: one SQLite file on one device,
 * no server holding a second copy. So the round trip is tested against a
 * database built by the real write path, with every play kind present.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { JERSEY, seedRoster } from '../support/seed';
import { replayGame } from '../support/replayFixture';
import { buildBackup, restoreBackup } from '../../src/lib/backup/backup';
import {
  BACKUP_TABLES, parseBackup, serializeBackup, suggestedFilename,
} from '../../src/lib/backup/format';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR, rebuildCursor } from '../../src/lib/game/cursor';
import { blankForm } from '../../src/lib/game/playForm';
import { importPlays } from '../../src/lib/db/repositories/plays';
import { DEFAULT_PLAYBOOK } from '../../src/lib/playbook/defaultPlaybook';
import { getGame, readGameCursor } from '../../src/lib/db/repositories/games';
import { listSnaps } from '../../src/lib/db/repositories/snaps';
import { listPlayers } from '../../src/lib/db/repositories/players';

/** A database with something of every kind in it. */
async function populated() {
  const db = await createTestDb();
  const seeded = await seedRoster(db);
  await importPlays(db, [...DEFAULT_PLAYBOOK]);

  let cursor = OPENING_CURSOR;
  const plays = [
    { ...blankForm('run'), ballCarrierNumber: JERSEY.rb, yardsGained: 7, formation: 'Shotgun' },
    { ...blankForm('pass'), quarterbackNumber: JERSEY.qb, targetNumber: JERSEY.wr,
      isComplete: true, yardsGained: 18, airYards: 12 },
    { ...blankForm('field_goal'), kickerNumber: JERSEY.k, kickDistance: 38, result: 'GOOD' as const },
    { ...blankForm('kickoff'), kickerNumber: JERSEY.k, kickYards: 60, isTouchback: true },
  ];
  for (const form of plays) {
    cursor = (await recordPlay(db, seeded.gameId, cursor, form, seeded.roster)).cursor;
  }
  // A defensive play with an assist, so defense_assists is not empty.
  await recordPlay(db, seeded.gameId, { ...cursor, possession: 'them' }, {
    ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 3,
    tacklerNumber: JERSEY.rb, assistNumbers: [JERSEY.qb],
  }, seeded.roster);

  return seeded;
}

describe('backup', () => {
  it('captures every table that holds a coach’s work', async () => {
    const { db } = await populated();
    const doc = await buildBackup(db, '0.1.0');

    for (const table of BACKUP_TABLES) {
      expect(doc.tables[table], table).toBeDefined();
      expect(doc.counts[table], table).toBe(doc.tables[table].length);
    }
    // Nothing important is empty.
    for (const table of ['teams', 'seasons', 'players', 'games', 'plays', 'snaps'] as const) {
      expect(doc.tables[table].length, table).toBeGreaterThan(0);
    }
    expect(doc.tables.defense_assists.length).toBeGreaterThan(0);
    expect(doc.schemaVersion).toBeGreaterThan(0);
  });

  it('round-trips into an empty database with ids intact', async () => {
    const { db, gameId } = await populated();
    const before = await buildBackup(db);

    const fresh = await createTestDb();
    const report = await restoreBackup(fresh, parseBackup(serializeBackup(before)));
    expect(report.total).toBeGreaterThan(0);

    const after = await buildBackup(fresh);
    // Ids preserved, so every foreign key still points where it did.
    expect(after.tables).toEqual(before.tables);
    expect((await getGame(fresh, gameId))?.opponent).toBe('Westfield');
    expect(await listSnaps(fresh, gameId)).toHaveLength(
      (await listSnaps(db, gameId)).length,
    );
  });

  it('replaces rather than merges', async () => {
    const { db } = await populated();
    const doc = await buildBackup(db);

    // A different database with its own data.
    const other = await createTestDb();
    await seedRoster(other);
    expect((await listPlayers(other, {})).length).toBeGreaterThan(0);

    await restoreBackup(other, doc);
    const after = await buildBackup(other);
    expect(after.tables).toEqual(doc.tables);
  });

  it('leaves the database untouched when a restore fails', async () => {
    const { db } = await populated();
    const good = await buildBackup(db);

    // A snap pointing at a game that is not in the backup: the deferred
    // foreign key fails at COMMIT, so the whole restore must roll back.
    const broken = parseBackup(serializeBackup(good));
    broken.tables.snaps = [{ ...broken.tables.snaps[0], id: 9999, game_id: 4242 }];
    broken.counts.snaps = 1;

    await expect(restoreBackup(db, broken)).rejects.toThrow();

    // Everything still there.
    const after = await buildBackup(db);
    expect(after.tables).toEqual(good.tables);
  });

  it('rebuilds each game’s cursor from its plays', async () => {
    const { db, gameId } = await populated();
    const doc = await buildBackup(db);

    // A backup carrying a stale cursor -- hand-edited, or taken before the
    // cursor columns existed.
    doc.tables.games = doc.tables.games.map((g) => ({
      ...g, current_ball_position: 0, current_down: 4, current_situation: 'kickoff',
    }));

    const fresh = await createTestDb();
    await restoreBackup(fresh, doc);

    expect(await readGameCursor(fresh, gameId)).toEqual(await rebuildCursor(fresh, gameId));
  });

  it('restores a whole real game', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);
    const doc = await buildBackup(db);

    const fresh = await createTestDb();
    await restoreBackup(fresh, doc);

    expect(await listSnaps(fresh, gameId)).toHaveLength(await listSnaps(db, gameId).then((s) => s.length));
    expect((await getGame(fresh, gameId))?.teamScore).toBe(36);
    expect((await getGame(fresh, gameId))?.opponentScore).toBe(33);
  });
});

describe('the backup file format', () => {
  it('rejects a file that is not JSON', () => {
    expect(() => parseBackup('nope')).toThrow(/valid JSON/);
  });

  it('rejects a file that is not a backup', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/not a Sportsman backup/);
  });

  it('refuses a backup from a newer version', () => {
    expect(() => parseBackup(JSON.stringify({
      format: 'sportsman-backup', version: 99, tables: {},
    }))).toThrow(/newer version/);
  });

  it('catches a truncated file through the counts', async () => {
    const { db } = await populated();
    const doc = await buildBackup(db);
    const text = serializeBackup({
      ...doc,
      tables: { ...doc.tables, snaps: doc.tables.snaps.slice(0, 1) },
    });
    // The JSON parses and the tables are lists; only the count disagrees.
    expect(() => parseBackup(text)).toThrow(/looks incomplete/);
  });

  it('treats a missing table as empty rather than failing', () => {
    const doc = parseBackup(JSON.stringify({
      format: 'sportsman-backup', version: 1, tables: { teams: [] },
    }));
    expect(doc.tables.snaps).toEqual([]);
  });

  it('names the backup by date', () => {
    expect(suggestedFilename(new Date('2026-09-04T12:00:00Z')))
      .toBe('sportsman-backup-2026-09-04.json');
  });
});
