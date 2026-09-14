import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import {
  clearPlays, countPlays, createPlay, deletePlay, importPlays,
  listFormations, listPlays,
} from '../../src/lib/db/repositories/plays';
import { DEFAULT_PLAYBOOK } from '../../src/lib/playbook/defaultPlaybook';
import {
  PlaybookFormatError, buildPlaybook, parsePlaybook,
  serializePlaybook, suggestedFilename,
} from '../../src/lib/playbook/format';

describe('the default playbook', () => {
  it('covers all three units', () => {
    const units = new Set(DEFAULT_PLAYBOOK.map((p) => p.unitType));
    expect(units).toEqual(new Set(['OFF', 'DEF', 'ST']));
  });

  it('has no duplicate calls', () => {
    const keys = DEFAULT_PLAYBOOK.map((p) => `${p.unitType}|${p.formation}|${p.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every play a formation', () => {
    for (const play of DEFAULT_PLAYBOOK) expect(play.formation).not.toBe('');
  });

  it('imports cleanly and completely', async () => {
    const db = await createTestDb();
    const result = await importPlays(db, [...DEFAULT_PLAYBOOK]);
    expect(result.added).toBe(DEFAULT_PLAYBOOK.length);
    expect(result.skipped).toBe(0);
    expect(await countPlays(db)).toBe(DEFAULT_PLAYBOOK.length);
  });
});

describe('the plays repository', () => {
  it('is idempotent: importing twice does not double the book', async () => {
    const db = await createTestDb();
    await importPlays(db, [...DEFAULT_PLAYBOOK]);
    const second = await importPlays(db, [...DEFAULT_PLAYBOOK]);

    expect(second.added).toBe(0);
    expect(second.skipped).toBe(DEFAULT_PLAYBOOK.length);
    expect(await countPlays(db)).toBe(DEFAULT_PLAYBOOK.length);
  });

  it('treats the same name from a different formation as a different play', async () => {
    const db = await createTestDb();
    await createPlay(db, { unitType: 'OFF', formation: 'I Formation', name: 'Power Right' });
    await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Power Right' });
    expect(await countPlays(db)).toBe(2);
  });

  it('refuses an outright duplicate', async () => {
    const db = await createTestDb();
    await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' });
    await expect(
      createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' }),
    ).rejects.toThrow();
  });

  it('lists formations per unit, sorted and deduplicated', async () => {
    const db = await createTestDb();
    await importPlays(db, [...DEFAULT_PLAYBOOK]);

    const offense = await listFormations(db, 'OFF');
    expect(offense).toContain('Shotgun');
    expect(offense).toContain('I Formation');
    expect(new Set(offense).size).toBe(offense.length);
    expect([...offense].sort()).toEqual(offense);
    expect(offense).not.toContain('4-3');
  });

  it('filters the list by unit', async () => {
    const db = await createTestDb();
    await importPlays(db, [...DEFAULT_PLAYBOOK]);
    const defense = await listPlays(db, 'DEF');
    expect(defense.length).toBeGreaterThan(0);
    expect(defense.every((p) => p.unitType === 'DEF')).toBe(true);
  });

  it('clears and rebuilds', async () => {
    const db = await createTestDb();
    await importPlays(db, [...DEFAULT_PLAYBOOK]);
    await clearPlays(db);
    expect(await countPlays(db)).toBe(0);
    await importPlays(db, [...DEFAULT_PLAYBOOK]);
    expect(await countPlays(db)).toBe(DEFAULT_PLAYBOOK.length);
  });

  it('deletes one play without touching the rest', async () => {
    const db = await createTestDb();
    const id = await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' });
    await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Mesh' });
    await deletePlay(db, id);
    expect((await listPlays(db)).map((p) => p.name)).toEqual(['Mesh']);
  });
});

describe('the playbook file format', () => {
  const round = (plays: Parameters<typeof buildPlaybook>[1]) =>
    parsePlaybook(serializePlaybook(buildPlaybook('My Book', plays)));

  it('round-trips the default playbook without loss', () => {
    const parsed = round([...DEFAULT_PLAYBOOK]);
    expect(parsed.name).toBe('My Book');
    expect(parsed.plays).toHaveLength(DEFAULT_PLAYBOOK.length);
    expect(parsed.plays[0]).toMatchObject({
      unitType: DEFAULT_PLAYBOOK[0].unitType,
      formation: DEFAULT_PLAYBOOK[0].formation,
      name: DEFAULT_PLAYBOOK[0].name,
    });
  });

  it('rejects a file that is not JSON', () => {
    expect(() => parsePlaybook('not json at all')).toThrow(/valid JSON/);
  });

  it('rejects a JSON file that is not a playbook', () => {
    expect(() => parsePlaybook('{"hello":"world"}')).toThrow(/not a Sportsman playbook/);
    expect(() => parsePlaybook('[]')).toThrow(PlaybookFormatError);
  });

  it('refuses a playbook from a newer version', () => {
    const doc = { ...buildPlaybook('x', []), version: 99 };
    expect(() => parsePlaybook(JSON.stringify(doc))).toThrow(/newer version/);
  });

  it('says which play is wrong, and why', () => {
    const doc = buildPlaybook('x', [
      { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' },
      { unitType: 'SPECIAL' as never, formation: 'Punt', name: 'Rugby' },
    ]);
    // A hand-edited file should point at the line to fix.
    expect(() => parsePlaybook(JSON.stringify(doc))).toThrow(/Play 2 \("Rugby"\)/);
    expect(() => parsePlaybook(JSON.stringify(doc))).toThrow(/OFF, DEF or ST/);
  });

  it('rejects a play with no name', () => {
    const doc = buildPlaybook('x', [{ unitType: 'OFF', formation: 'Shotgun', name: '   ' }]);
    expect(() => parsePlaybook(JSON.stringify(doc))).toThrow(/Play 1 has no name/);
  });

  it('accepts a hand-written file with the formation left out', () => {
    const doc = {
      format: 'sportsman-playbook', version: 1, name: 'Terse', exportedAt: '',
      plays: [{ unitType: 'OFF', name: 'Sneak' }],
    };
    expect(parsePlaybook(JSON.stringify(doc)).plays[0]).toEqual({
      unitType: 'OFF', formation: '', name: 'Sneak', description: '',
    });
  });

  it('trims whitespace a hand-editor leaves behind', () => {
    const doc = {
      format: 'sportsman-playbook', version: 1, name: 'x', exportedAt: '',
      plays: [{ unitType: 'OFF', formation: '  Shotgun  ', name: '  Draw  ' }],
    };
    expect(parsePlaybook(JSON.stringify(doc)).plays[0]).toMatchObject({
      formation: 'Shotgun', name: 'Draw',
    });
  });

  it('cannot produce a filename that escapes its directory', () => {
    expect(suggestedFilename('../../etc/passwd')).toBe('etc-passwd.playbook.json');
    expect(suggestedFilename('Coach K/2026')).toBe('coach-k-2026.playbook.json');
    expect(suggestedFilename('')).toBe('playbook.playbook.json');
  });

  it('survives a file that was exported and re-imported through the database', async () => {
    const db = await createTestDb();
    await importPlays(db, [...DEFAULT_PLAYBOOK]);
    const exported = serializePlaybook(buildPlaybook('Season', await listPlays(db)));

    const fresh = await createTestDb();
    const result = await importPlays(fresh, parsePlaybook(exported).plays);
    expect(result.added).toBe(DEFAULT_PLAYBOOK.length);
    expect(await listPlays(fresh)).toHaveLength(DEFAULT_PLAYBOOK.length);
  });
});
