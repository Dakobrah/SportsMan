/**
 * Reading and writing a backup file. The only module here that imports Tauri.
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Database } from '../db/driver';
import { buildBackup } from './backup';
import { parseBackup, serializeBackup, suggestedFilename, type BackupDocument } from './format';

const FILTER = { name: 'Sportsman backup', extensions: ['json'] };

/** `path: null` means the user cancelled, which is not an error. */
export async function saveBackup(
  db: Database,
  appVersion = '',
): Promise<{ path: string | null }> {
  const path = await save({ defaultPath: suggestedFilename(), filters: [FILTER] });
  if (!path) return { path: null };
  await writeTextFile(path, serializeBackup(await buildBackup(db, appVersion)));
  return { path };
}

export async function openBackup(): Promise<BackupDocument | null> {
  const path = await open({ multiple: false, directory: false, filters: [FILTER] });
  if (typeof path !== 'string') return null;
  return parseBackup(await readTextFile(path));
}
