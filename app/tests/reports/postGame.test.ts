/**
 * The post-game template, built from the real game.
 *
 * The numbers underneath are already checked against nflverse in
 * replay.reports.test.ts. What this covers is the template: that it asks for
 * the right things, that every chart carries its table, and that a section
 * with nothing to say is left out rather than rendered empty.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { replayGame } from '../support/replayFixture';
import { seedRoster } from '../support/seed';
import { buildPostGame } from '../../src/lib/reports/templates/postGame';
import { TEMPLATES, templateById } from '../../src/lib/reports/templates';
import { pathForScope, scopeFromQuery } from '../../src/lib/reports/scope';
import type { ReportModel } from '../../src/lib/reports/model';

const built = async () => {
  const db = await createTestDb();
  const { gameId } = await replayGame(db);
  return { db, gameId, model: await buildPostGame(db, { kind: 'game', gameId }) };
};

const sectionIds = (model: ReportModel) => model.sections.map((s) => s.id);

describe('the post-game template', () => {
  it('leads with the result', async () => {
    const { model } = await built();
    expect(model.title).toBe('WAS vs PHI');
    // WAS won 36-33.
    expect(model.headline).toMatchObject({ label: 'Won', value: '36–33' });
  });

  it('builds every section the game has material for', async () => {
    const { model } = await built();
    for (const id of ['scoring', 'offense', 'defense', 'situational', 'drives', 'leaders']) {
      expect(sectionIds(model), id).toContain(id);
    }
    expect(model.sections.every((s) => s.blocks.length > 0)).toBe(true);
  });

  it('gives every chart the same numbers as a table', async () => {
    const { model } = await built();
    const charts = model.sections.flatMap((s) => s.blocks).filter((b) => b.type === 'chart');
    expect(charts.length).toBeGreaterThan(3);
    for (const block of charts) {
      // Required by the type, so this asserts it is also populated.
      expect(block.body.columns.length, block.title).toBeGreaterThan(0);
      expect(block.body.rows.length, block.title).toBeGreaterThan(0);
    }
  });

  it('reports our offense, not both teams added together', async () => {
    const { model } = await built();
    const offense = model.sections.find((s) => s.id === 'offense')!;
    const stats = offense.blocks.find((b) => b.type === 'stats')!;
    // WAS gained 113 rushing and 258 passing.
    expect(stats.stats.find((s) => s.label === 'Total yards')?.value).toBe('371');
  });

  it('reports the defense as what their offense did', async () => {
    const { model } = await built();
    const defense = model.sections.find((s) => s.id === 'defense')!;
    expect(defense.blocks.some((b) => b.type === 'text')).toBe(true);
    const stats = defense.blocks.find((b) => b.type === 'stats')!;
    expect(stats.stats.map((s) => s.label)).toContain('Turnover margin');
  });

  it('lists the drives it segmented', async () => {
    const { model } = await built();
    const drives = model.sections.find((s) => s.id === 'drives')!;
    const chart = drives.blocks.find((b) => b.type === 'chart')!;
    expect(chart.body.rows).toHaveLength(26);
  });

  it('names real players in the leader tables', async () => {
    const { model } = await built();
    const leaders = model.sections.find((s) => s.id === 'leaders')!;
    const rushing = leaders.blocks.find((b) => b.type === 'table' && b.title === 'Rushing');
    expect(rushing).toBeDefined();
    expect(String(rushing!.type === 'table' && rushing!.body.rows[0].player)).toMatch(/^#\d+ /);
  });

  it('leaves out a section with nothing to report', async () => {
    // A game with a roster and no plays at all.
    const db = await createTestDb();
    const { gameId } = await seedRoster(db);
    const model = await buildPostGame(db, { kind: 'game', gameId });

    expect(sectionIds(model)).not.toContain('special-teams');
    expect(sectionIds(model)).not.toContain('key-plays');
    expect(sectionIds(model)).not.toContain('penalties');
    // But the structural sections still render, empty rather than missing.
    expect(sectionIds(model)).toContain('scoring');
  });

  it('refuses a scope it cannot use', async () => {
    const db = await createTestDb();
    await expect(buildPostGame(db, { kind: 'season', seasonId: 1 })).rejects.toThrow(/needs a game/);
    await expect(buildPostGame(db, { kind: 'game', gameId: 999 })).rejects.toThrow(/does not exist/);
  });
});

describe('the registry and scope', () => {
  it('finds a template by id and rejects an unknown one', () => {
    expect(templateById('post-game')?.name).toBe('Post-game report');
    expect(templateById('nonsense')).toBeUndefined();
  });

  it('round-trips a scope through the query string', () => {
    const path = pathForScope('post-game', { kind: 'game', gameId: 42 });
    expect(path).toBe('/reports/post-game?game=42');
    const query = new URLSearchParams(path.split('?')[1]);
    expect(scopeFromQuery('post-game', query)).toEqual({ kind: 'game', gameId: 42 });
  });

  it('returns null for a scope that is missing or malformed', () => {
    const bad = (q: string) => scopeFromQuery('post-game', new URLSearchParams(q));
    expect(bad('')).toBeNull();
    expect(bad('game=abc')).toBeNull();
    expect(bad('game=-1')).toBeNull();
    expect(bad('game=0')).toBeNull();
  });

  it('carries an optional season on the scopes that take one', () => {
    expect(scopeFromQuery('opponent', new URLSearchParams('opponent=Westfield')))
      .toEqual({ kind: 'opponent', opponent: 'Westfield' });
    expect(scopeFromQuery('opponent', new URLSearchParams('opponent=Westfield&season=3')))
      .toEqual({ kind: 'opponent', opponent: 'Westfield', seasonId: 3 });
  });

  it('declares a scope kind for every template', () => {
    for (const template of TEMPLATES) {
      expect(['game', 'season', 'opponent', 'player']).toContain(template.scopeKind);
    }
  });
});
