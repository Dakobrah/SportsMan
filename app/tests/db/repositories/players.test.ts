import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../support/testDb';
import { seedGame, seedPlayer } from '../../support/seed';
import { createTeam } from '../../../src/lib/db/repositories/teams';
import {
  deletePlayer,
  getPlayer,
  listPlayers,
  playerSnapCount,
  rosterForGame,
  setPlayerActive,
  updatePlayer,
} from '../../../src/lib/db/repositories/players';
import { addAssist, getSnap, insertSnap } from '../../../src/lib/db/repositories/snaps';

describe('players repository', () => {
  it('round-trips is_active as a real boolean', async () => {
    const db = await createTestDb();
    const { teamId } = await seedGame(db);
    const id = await seedPlayer(db, teamId, { isActive: false });

    const player = await getPlayer(db, id);
    // Not 0 -- the 0/1 bridge lives in types.ts so call sites never see it.
    expect(player?.isActive).toBe(false);
    expect(typeof player?.isActive).toBe('boolean');

    await setPlayerActive(db, id, true);
    expect((await getPlayer(db, id))?.isActive).toBe(true);
  });

  it('filters by team, position, active and search', async () => {
    const db = await createTestDb();
    const { teamId } = await seedGame(db);
    const other = await createTeam(db, { name: 'Westfield', abbreviation: 'WFD' });

    await seedPlayer(db, teamId, { firstName: 'Alex', lastName: 'Rivera', position: 'RB', number: 22 });
    await seedPlayer(db, teamId, { firstName: 'Sam', lastName: 'Okafor', position: 'QB', number: 7 });
    await seedPlayer(db, teamId, { firstName: 'Jo', lastName: 'Pike', position: 'RB', number: 30, isActive: false });
    await seedPlayer(db, other, { firstName: 'Chris', lastName: 'Vance', position: 'RB', number: 22 });

    expect(await listPlayers(db, { teamId })).toHaveLength(3);
    expect(await listPlayers(db, { teamId, position: 'RB' })).toHaveLength(2);
    expect(await listPlayers(db, { teamId, activeOnly: true })).toHaveLength(2);

    expect((await listPlayers(db, { teamId, search: 'Okaf' })).map((p) => p.number)).toEqual([7]);
    // Search also matches the jersey number.
    expect((await listPlayers(db, { teamId, search: '30' })).map((p) => p.lastName)).toEqual(['Pike']);
  });

  it('orders by jersey number', async () => {
    const db = await createTestDb();
    const { teamId } = await seedGame(db);
    await seedPlayer(db, teamId, { number: 44 });
    await seedPlayer(db, teamId, { number: 7 });
    await seedPlayer(db, teamId, { number: 22 });

    expect((await listPlayers(db, { teamId })).map((p) => p.number)).toEqual([7, 22, 44]);
  });

  it('builds a game roster from active players on that game only', async () => {
    const db = await createTestDb();
    const { teamId, gameId } = await seedGame(db);
    const other = await createTeam(db, { name: 'Westfield', abbreviation: 'WFD' });

    await seedPlayer(db, teamId, { number: 22 });
    await seedPlayer(db, teamId, { number: 7 });
    await seedPlayer(db, teamId, { number: 55, isActive: false });
    await seedPlayer(db, other, { number: 1 });

    const roster = await rosterForGame(db, gameId);
    expect(roster.map((p) => p.number)).toEqual([7, 22]);
    expect(roster.every((p) => p.teamId === teamId)).toBe(true);
  });

  it('counts every kind of reference to a player, assists included', async () => {
    const db = await createTestDb();
    const { teamId, gameId } = await seedGame(db);
    const runner = await seedPlayer(db, teamId, { number: 22 });
    const kicker = await seedPlayer(db, teamId, { position: 'K', number: 3 });
    const bench = await seedPlayer(db, teamId, { number: 99 });

    await insertSnap(db, gameId, { kind: 'RUN', quarter: 1, ballCarrierId: runner });
    await insertSnap(db, gameId, { kind: 'PASS', quarterbackId: runner, quarter: 1 });
    await insertSnap(db, gameId, { kind: 'FG', quarter: 2, kickerId: kicker });
    const tackle = await insertSnap(db, gameId, { kind: 'DEFENSE', quarter: 2 });
    await addAssist(db, tackle.id, runner, 'TACKLE');

    expect(await playerSnapCount(db, runner)).toBe(3); // two snaps plus one assist
    expect(await playerSnapCount(db, kicker)).toBe(1);
    expect(await playerSnapCount(db, bench)).toBe(0);
  });

  it('keeps the play but drops attribution when a player is deleted', async () => {
    const db = await createTestDb();
    const { teamId, gameId } = await seedGame(db);
    const runner = await seedPlayer(db, teamId, { number: 22 });
    const { id } = await insertSnap(db, gameId, {
      kind: 'RUN',
      quarter: 1,
      ballCarrierId: runner,
      yardsGained: 12,
    });

    await deletePlayer(db, runner);

    // ON DELETE SET NULL: the play survives, unattributed. This is exactly why
    // the UI offers setPlayerActive(false) instead.
    const snap = await getSnap(db, id);
    expect(snap?.yardsGained).toBe(12);
    expect(snap?.ballCarrierId).toBeNull();
  });

  it('updates every editable field', async () => {
    const db = await createTestDb();
    const { teamId } = await seedGame(db);
    const id = await seedPlayer(db, teamId, { number: 22 });

    await updatePlayer(db, id, {
      teamId,
      firstName: 'Alexis',
      lastName: 'Rivera-Cole',
      position: 'WR',
      number: 81,
      isActive: true,
    });

    expect(await getPlayer(db, id)).toMatchObject({
      firstName: 'Alexis',
      lastName: 'Rivera-Cole',
      position: 'WR',
      number: 81,
    });
  });
});
