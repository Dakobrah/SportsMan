import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { JERSEY, seedRoster } from '../support/seed';
import { createPlay } from '../../src/lib/db/repositories/plays';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR } from '../../src/lib/game/cursor';
import { blankForm } from '../../src/lib/game/playForm';
import { playCalls, tendencies } from '../../src/lib/db/reports/team';
import { listSnaps } from '../../src/lib/db/repositories/snaps';

describe('tendencies', () => {
  it('reports the run/pass split per formation', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const power = await createPlay(db, { unitType: 'OFF', formation: 'I Formation', name: 'Power Right' });
    const mesh = await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Mesh' });

    for (let i = 0; i < 3; i++) {
      await recordPlay(db, gameId, OPENING_CURSOR, {
        ...blankForm('run'), playId: power, formation: 'I Formation',
        ballCarrierNumber: JERSEY.rb, yardsGained: 4,
      }, roster);
    }
    await recordPlay(db, gameId, OPENING_CURSOR, {
      ...blankForm('pass'), playId: mesh, formation: 'Shotgun',
      quarterbackNumber: JERSEY.qb, isComplete: true, yardsGained: 12,
    }, roster);

    const rows = await tendencies(db, { gameIds: [gameId] });
    expect(rows[0]).toMatchObject({
      formation: 'I Formation', plays: 3, runs: 3, passes: 0, yards: 12, runPct: 100,
    });
    expect(rows[1]).toMatchObject({ formation: 'Shotgun', runs: 0, passes: 1, runPct: 0 });
  });

  it('keeps the formation a game was recorded with after the playbook changes', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const play = await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' });

    await recordPlay(db, gameId, OPENING_CURSOR, {
      ...blankForm('run'), playId: play, formation: 'Shotgun',
      ballCarrierNumber: JERSEY.rb, yardsGained: 6,
    }, roster);

    // Delete the play out of the book. snaps.play_id is ON DELETE SET NULL.
    await db.run('DELETE FROM plays WHERE id = ?', [play]);

    const snap = (await listSnaps(db, gameId))[0];
    expect(snap.playId).toBeNull();
    // The formation text survives, so the tendency report still works.
    expect(snap.formation).toBe('Shotgun');
    expect((await tendencies(db, { gameIds: [gameId] }))[0]).toMatchObject({
      formation: 'Shotgun', plays: 1, yards: 6,
    });
  });

  it('separates our calls from theirs', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    await recordPlay(db, gameId, OPENING_CURSOR, {
      ...blankForm('run'), formation: 'Shotgun',
      ballCarrierNumber: JERSEY.rb, yardsGained: 5,
    }, roster);
    await recordPlay(db, gameId, { ...OPENING_CURSOR, possession: 'them' }, {
      ...blankForm('run'), formation: '4-3', ballCarrierNumber: 30, yardsGained: 2,
    }, roster);

    // Ours is an offensive formation; theirs records the defence we were in.
    expect((await tendencies(db, { gameIds: [gameId], possession: 'us' })).map((r) => r.formation))
      .toEqual(['Shotgun']);
    expect((await tendencies(db, { gameIds: [gameId], possession: 'them' })).map((r) => r.formation))
      .toEqual(['4-3']);
  });

  it('ignores plays with no formation recorded', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: JERSEY.rb, yardsGained: 3 }, roster);
    expect(await tendencies(db, { gameIds: [gameId] })).toHaveLength(0);
  });

  it('counts individual calls, most used first', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const draw = await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' });
    const mesh = await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Mesh' });

    for (const [playId, yards] of [[draw, 5], [draw, 3], [mesh, 11]] as const) {
      await recordPlay(db, gameId, OPENING_CURSOR, {
        ...blankForm('run'), playId, formation: 'Shotgun',
        ballCarrierNumber: JERSEY.rb, yardsGained: yards,
      }, roster);
    }

    const calls = await playCalls(db, { gameIds: [gameId] });
    expect(calls).toEqual([
      { formation: 'Shotgun', name: 'Draw', calls: 2, yards: 8 },
      { formation: 'Shotgun', name: 'Mesh', calls: 1, yards: 11 },
    ]);
  });

  it('counts a sack against the call that produced it', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());
    const mesh = await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Mesh' });

    await recordPlay(db, gameId, OPENING_CURSOR, {
      ...blankForm('pass'), playId: mesh, formation: 'Shotgun',
      quarterbackNumber: JERSEY.qb, wasSacked: true, yardsGained: 7,
    }, roster);

    // The loss, not the zero gain -- the same rule the rest of the app uses.
    expect((await playCalls(db, { gameIds: [gameId] }))[0].yards).toBe(-7);
    expect((await tendencies(db, { gameIds: [gameId] }))[0].yards).toBe(-7);
  });
});
