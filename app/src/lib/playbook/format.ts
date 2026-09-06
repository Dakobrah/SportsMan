/**
 * The playbook interchange format.
 *
 * Pure: parse and serialise only, no file access, so it is fully testable in
 * Node. `io.ts` is the thin layer that touches the disk.
 *
 * A playbook is a coach's own work and the file is meant to be shared and
 * hand-edited, so the shape is deliberately plain and the parser is strict
 * about what it accepts and specific about what it rejects.
 */
import type { PlayInput } from '../db/repositories/plays';
import type { UnitType } from '../db/repositories/types';

export const PLAYBOOK_FORMAT = 'sportsman-playbook';
export const PLAYBOOK_VERSION = 1;

export interface PlaybookDocument {
  format: typeof PLAYBOOK_FORMAT;
  version: number;
  name: string;
  exportedAt: string;
  plays: PlayInput[];
}

export class PlaybookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaybookFormatError';
  }
}

const UNITS: readonly UnitType[] = ['OFF', 'DEF', 'ST'];

export function buildPlaybook(name: string, plays: PlayInput[]): PlaybookDocument {
  return {
    format: PLAYBOOK_FORMAT,
    version: PLAYBOOK_VERSION,
    name,
    exportedAt: new Date().toISOString(),
    plays,
  };
}

export const serializePlaybook = (doc: PlaybookDocument): string =>
  `${JSON.stringify(doc, null, 2)}\n`;

/** Parse and validate. Throws PlaybookFormatError with a readable reason. */
export function parsePlaybook(text: string): PlaybookDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PlaybookFormatError('That file is not valid JSON.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new PlaybookFormatError('That file does not contain a playbook.');
  }
  // Everything below treats the contents as unknown: this file may have
  // been hand-edited, so the declared type is a claim, not a fact.
  const doc = raw as Partial<Omit<PlaybookDocument, 'plays'>> & { plays?: unknown };

  if (doc.format !== PLAYBOOK_FORMAT) {
    throw new PlaybookFormatError('That file is not a Sportsman playbook.');
  }
  if (typeof doc.version !== 'number' || doc.version > PLAYBOOK_VERSION) {
    throw new PlaybookFormatError(
      'That playbook was made by a newer version of Sportsman.',
    );
  }
  if (!Array.isArray(doc.plays)) {
    throw new PlaybookFormatError('That playbook has no plays in it.');
  }

  const plays: PlayInput[] = (doc.plays as unknown[]).map((play, index) => {
    const where = `Play ${index + 1}`;
    if (typeof play !== 'object' || play === null) {
      throw new PlaybookFormatError(`${where} is not a play.`);
    }
    const { unitType, formation, name, description } = play as Record<string, unknown>;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new PlaybookFormatError(`${where} has no name.`);
    }
    if (typeof unitType !== 'string' || !UNITS.includes(unitType as UnitType)) {
      throw new PlaybookFormatError(
        `${where} ("${name}") has unit "${String(unitType)}"; expected OFF, DEF or ST.`,
      );
    }
    if (formation !== undefined && typeof formation !== 'string') {
      throw new PlaybookFormatError(`${where} ("${name}") has a formation that is not text.`);
    }
    return {
      unitType: unitType as UnitType,
      formation: (formation as string | undefined)?.trim() ?? '',
      name: name.trim(),
      description: typeof description === 'string' ? description : '',
    };
  });

  return {
    format: PLAYBOOK_FORMAT,
    version: doc.version,
    name: typeof doc.name === 'string' ? doc.name : 'Playbook',
    exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : '',
    plays,
  };
}

/** A filename that cannot escape the directory the user chose. */
export function suggestedFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'playbook'}.playbook.json`;
}
