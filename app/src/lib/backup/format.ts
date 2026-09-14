/**
 * The backup document.
 *
 * Rows are the RAW SQLite rows -- snake_case keys, booleans as 0/1, ids as
 * stored -- not the camelCase domain types. A backup is a database dump, not
 * an API: a schema change should be visible as a document change, and there
 * is no lossy mapping layer to keep in step with the schema.
 *
 * Pure. `files.ts` is the only part that touches the disk.
 */
export const BACKUP_FORMAT = 'sportsman-backup';
export const BACKUP_VERSION = 1;

/**
 * Every table that holds a coach's own work, in FOREIGN KEY ORDER -- a
 * restore inserts in exactly this sequence.
 *
 * `schema_version` is deliberately absent: it is carried as a scalar, and
 * restoring it as rows would let a backup claim a schema it does not have.
 */
export const BACKUP_TABLES = [
  'teams',
  'seasons',
  'players',
  'games',
  'quarter_scores',
  'plays',
  'snaps',
  'defense_assists',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type Row = Record<string, unknown>;

export interface BackupDocument {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** The schema the backup was taken at, so a restore can migrate forward. */
  schemaVersion: number;
  exportedAt: string;
  app: { name: 'sportsman'; version: string };
  /** A cheap integrity check against the tables below. */
  counts: Record<BackupTable, number>;
  tables: Record<BackupTable, Row[]>;
}

export class BackupFormatError extends Error {
  readonly detail: string;
  constructor(message: string, detail = '') {
    super(message);
    this.name = 'BackupFormatError';
    this.detail = detail;
  }
}

export const serializeBackup = (doc: BackupDocument): string =>
  `${JSON.stringify(doc)}\n`;

export function suggestedFilename(date = new Date()): string {
  return `sportsman-backup-${date.toISOString().slice(0, 10)}.json`;
}

/** Parse and validate. Throws BackupFormatError with a readable reason. */
export function parseBackup(text: string): BackupDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError('That file is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupFormatError('That file does not contain a backup.');
  }

  const doc = raw as Partial<BackupDocument>;
  if (doc.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('That file is not a Sportsman backup.');
  }
  if (typeof doc.version !== 'number' || doc.version > BACKUP_VERSION) {
    throw new BackupFormatError('That backup was made by a newer version of Sportsman.');
  }
  if (typeof doc.tables !== 'object' || doc.tables === null) {
    throw new BackupFormatError('That backup has no data in it.');
  }

  const tables = {} as Record<BackupTable, Row[]>;
  for (const table of BACKUP_TABLES) {
    const rows = (doc.tables as Record<string, unknown>)[table];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new BackupFormatError(`The "${table}" section of that backup is not a list.`);
    }
    tables[table] = (rows as Row[] | undefined) ?? [];
  }

  // The counts are what catch a truncated file: the JSON parses, the tables
  // are lists, and one of them is simply short.
  const counts = (doc.counts ?? {}) as Record<string, unknown>;
  for (const table of BACKUP_TABLES) {
    const claimed = counts[table];
    if (typeof claimed === 'number' && claimed !== tables[table].length) {
      throw new BackupFormatError(
        'That backup looks incomplete.',
        `${table}: expected ${claimed} rows, found ${tables[table].length}.`,
      );
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: doc.version,
    schemaVersion: typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0,
    exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : '',
    app: doc.app ?? { name: 'sportsman', version: '' },
    counts: Object.fromEntries(
      BACKUP_TABLES.map((t) => [t, tables[t].length]),
    ) as Record<BackupTable, number>,
    tables,
  };
}
