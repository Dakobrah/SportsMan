/**
 * Loading the demo's starting data.
 *
 * Only imported by the demo build -- the desktop app's bundle never includes
 * the seed, because `openDatabase` gates the import on a build-time flag.
 *
 * It goes in through `restoreBackup`, the same path a coach's own backup
 * takes, so the demo exercises the shipped restore rather than a second
 * loader written just for it.
 */
import type { Database } from '../db/driver';
import { restoreBackup } from '../backup/backup';
import { parseBackup } from '../backup/format';
import seed from './seed.json?raw';

export async function seedDemo(db: Database): Promise<void> {
  await restoreBackup(db, parseBackup(seed));
}
