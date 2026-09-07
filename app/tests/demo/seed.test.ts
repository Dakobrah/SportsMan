/**
 * The demo's starting database.
 *
 * The playable demo opens on a real game already recorded, so a visitor has
 * something to read instead of an empty roster. That seed is a backup
 * document -- the same format the app's own restore consumes -- generated
 * here from the replay fixture.
 *
 * This test WRITES the seed as well as checking it. That is deliberate: the
 * seed is derived data, and regenerating it on every run is what stops it
 * drifting from the schema. It is deterministic, so a run with no schema
 * change leaves the file byte-identical.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../support/testDb';
import { replayGame } from '../support/replayFixture';
import { buildBackup, restoreBackup } from '../../src/lib/backup/backup';
import { parseBackup, serializeBackup } from '../../src/lib/backup/format';
import { importPlays } from '../../src/lib/db/repositories/plays';
import { DEFAULT_PLAYBOOK } from '../../src/lib/playbook/defaultPlaybook';
import { getGame } from '../../src/lib/db/repositories/games';
import { listSnaps } from '../../src/lib/db/repositories/snaps';

const SEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib', 'demo', 'seed.json',
);

/** Fixed, so a regeneration with no real change produces no diff. */
const EXPORTED_AT = '2026-01-01T00:00:00.000Z';

async function buildSeed() {
  const db = await createTestDb();
  const { gameId } = await replayGame(db);
  await importPlays(db, [...DEFAULT_PLAYBOOK]);
  const doc = await buildBackup(db, 'demo');
  return { db, gameId, doc: { ...doc, exportedAt: EXPORTED_AT } };
}

describe('the demo seed', () => {
  it('is a real game, written where the demo build can import it', async () => {
    const { doc } = await buildSeed();

    expect(doc.counts.games).toBe(1);
    expect(doc.counts.snaps).toBeGreaterThan(150);
    expect(doc.counts.players).toBeGreaterThan(0);
    // The starter playbook too, so the tracker's play picker is populated.
    expect(doc.counts.plays).toBe(DEFAULT_PLAYBOOK.length);

    writeFileSync(SEED_PATH, serializeBackup(doc));
  });

  it('restores into an empty database and reproduces the game', async () => {
    const { doc, gameId } = await buildSeed();

    const fresh = await createTestDb();
    await restoreBackup(fresh, parseBackup(serializeBackup(doc)));

    const game = await getGame(fresh, gameId);
    expect(game?.teamScore).toBe(36);
    expect(game?.opponentScore).toBe(33);
    expect(await listSnaps(fresh, gameId)).toHaveLength(doc.counts.snaps);
  });

  it('is deterministic, so regenerating it produces no diff', async () => {
    const a = await buildSeed();
    const b = await buildSeed();
    expect(serializeBackup(a.doc)).toBe(serializeBackup(b.doc));
  });
});
