/**
 * Reading and writing a playbook file.
 *
 * The only module here that imports Tauri. Everything with logic in it lives
 * in format.ts, which is why that half is testable in plain Node.
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  buildPlaybook, parsePlaybook, serializePlaybook, suggestedFilename,
  type PlaybookDocument,
} from './format';
import type { PlayInput } from '../db/repositories/plays';

const FILTER = { name: 'Playbook', extensions: ['json'] };

/** `path: null` means the user cancelled, which is not an error. */
export async function savePlaybook(
  name: string,
  plays: PlayInput[],
): Promise<{ path: string | null }> {
  const path = await save({ defaultPath: suggestedFilename(name), filters: [FILTER] });
  if (!path) return { path: null };
  await writeTextFile(path, serializePlaybook(buildPlaybook(name, plays)));
  return { path };
}

export async function openPlaybook(): Promise<PlaybookDocument | null> {
  const path = await open({ multiple: false, directory: false, filters: [FILTER] });
  if (typeof path !== 'string') return null;
  return parsePlaybook(await readTextFile(path));
}
