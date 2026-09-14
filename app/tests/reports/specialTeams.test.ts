import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame } from '../support/seed';
import { insertSnap, type NewSnap } from '../../src/lib/db/repositories/snaps';
import {
  extraPointTotals, fieldGoalTotals, fieldGoalsByDistance,
  kickoffTotals, puntTotals,
} from '../../src/lib/db/reports/specialTeams';
import { penaltiesByName, penaltyTotals } from '../../src/lib/db/reports/penalties';

async function withSnaps(snaps: NewSnap[]) {
  const db = await createTestDb();
  const { gameId } = await seedGame(db);
  for (const snap of snaps) await insertSnap(db, gameId, snap);
  return db;
}

describe('field goals', () => {
  it('reports the longest MADE kick, not the longest attempt', async () => {
    const db = await withSnaps([
      { kind: 'FG', quarter: 1, kickDistance: 32, result: 'GOOD' },
      { kind: 'FG', quarter: 2, kickDistance: 55, result: 'MISS' },
      { kind: 'FG', quarter: 3, kickDistance: 41, result: 'GOOD' },
      { kind: 'FG', quarter: 4, kickDistance: 48, result: 'BLOCK' },
    ]);
    expect(await fieldGoalTotals(db, {})).toEqual({
      attempts: 4, made: 2, missed: 1, blocked: 1, longest: 41,
    });
  });

  it('has a null longest when nothing was made', async () => {
    const db = await withSnaps([{ kind: 'FG', quarter: 1, kickDistance: 50, result: 'MISS' }]);
    expect((await fieldGoalTotals(db, {})).longest).toBeNull();
  });

  it('bands by distance, always returning every band', async () => {
    const db = await withSnaps([
      { kind: 'FG', quarter: 1, kickDistance: 22, result: 'GOOD' },
      { kind: 'FG', quarter: 2, kickDistance: 35, result: 'GOOD' },
      { kind: 'FG', quarter: 3, kickDistance: 52, result: 'MISS' },
    ]);
    const bands = await fieldGoalsByDistance(db, {});
    expect(bands.map((b) => b.band)).toEqual(['under 30', '30-39', '40-49', '50+']);
    expect(bands.find((b) => b.band === '50+')).toMatchObject({ attempts: 1, made: 0 });
    expect(bands.find((b) => b.band === '40-49')).toMatchObject({ attempts: 0, made: 0 });
  });
});

describe('punting and kickoffs', () => {
  it('counts a blocked punt as a punt', async () => {
    const db = await withSnaps([
      { kind: 'PUNT', quarter: 1, puntYards: 44 },
      { kind: 'PUNT', quarter: 2, puntYards: 0, isBlocked: true },
      { kind: 'PUNT', quarter: 3, puntYards: 38, isTouchback: true },
    ]);
    expect(await puntTotals(db, {})).toEqual({
      punts: 3, yards: 82, longest: 44, touchbacks: 1, blocked: 1, outOfBounds: 0,
    });
  });

  it('counts kickoffs and onside attempts', async () => {
    const db = await withSnaps([
      { kind: 'KICKOFF', quarter: 1, kickYards: 65, isTouchback: true },
      { kind: 'KICKOFF', quarter: 4, kickYards: 12, isOnsideKick: true },
    ]);
    expect(await kickoffTotals(db, {})).toEqual({
      kickoffs: 2, yards: 77, touchbacks: 1, onsideAttempts: 1, outOfBounds: 0,
    });
  });
});

describe('extra points', () => {
  it('splits kicks from two-point attempts', async () => {
    const db = await withSnaps([
      { kind: 'XP', quarter: 1, attemptType: 'KICK', result: 'GOOD' },
      { kind: 'XP', quarter: 2, attemptType: 'KICK', result: 'MISS' },
      { kind: 'XP', quarter: 3, attemptType: '2PT_RUN', result: 'GOOD' },
      { kind: 'XP', quarter: 4, attemptType: '2PT_PASS', result: 'MISS' },
    ]);
    expect(await extraPointTotals(db, {})).toEqual({
      patAttempts: 2, patMade: 1, twoPointAttempts: 2, twoPointMade: 1,
    });
  });
});

describe('penalties', () => {
  it('splits accepted from declined and offense from defense', async () => {
    const db = await withSnaps([
      { kind: 'PENALTY', quarter: 1, hadPenalty: true, penaltyDescription: 'False Start',
        penaltyYards: 5, penaltyAccepted: true, penaltyOnOffense: true },
      { kind: 'PENALTY', quarter: 1, hadPenalty: true, penaltyDescription: 'Holding (Defense)',
        penaltyYards: 5, penaltyAccepted: true, penaltyOnOffense: false },
      { kind: 'PENALTY', quarter: 2, hadPenalty: true, penaltyDescription: 'False Start',
        penaltyYards: 0, penaltyAccepted: false, penaltyOnOffense: true },
    ]);
    expect(await penaltyTotals(db, {})).toEqual({
      penalties: 3, yards: 10, accepted: 2, declined: 1, onOffense: 2, onDefense: 1,
    });
  });

  it('groups by name, most frequent first', async () => {
    const db = await withSnaps([
      { kind: 'PENALTY', quarter: 1, hadPenalty: true, penaltyDescription: 'False Start', penaltyYards: 5 },
      { kind: 'PENALTY', quarter: 2, hadPenalty: true, penaltyDescription: 'False Start', penaltyYards: 5 },
      { kind: 'PENALTY', quarter: 3, hadPenalty: true, penaltyDescription: 'Clipping', penaltyYards: 15 },
    ]);
    const rows = await penaltiesByName(db, {});
    expect(rows).toEqual([
      { name: 'False Start', count: 2, yards: 10 },
      { name: 'Clipping', count: 1, yards: 15 },
    ]);
  });
});
