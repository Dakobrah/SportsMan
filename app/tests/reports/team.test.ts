import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame } from '../support/seed';
import { insertSnap, type NewSnap } from '../../src/lib/db/repositories/snaps';
import {
  downEfficiency, fieldZones, teamTotals, yardageBuckets,
} from '../../src/lib/db/reports/team';

async function withSnaps(snaps: NewSnap[]) {
  const db = await createTestDb();
  const { gameId, teamId } = await seedGame(db);
  for (const snap of snaps) await insertSnap(db, gameId, snap);
  return { db, gameId, teamId };
}

const run = (o: Partial<NewSnap> = {}): NewSnap => ({ kind: 'RUN', quarter: 1, ...o });
const pass = (o: Partial<NewSnap> = {}): NewSnap => ({ kind: 'PASS', quarter: 1, ...o });

describe('teamTotals', () => {
  it('is all zeros and nulls with no plays', async () => {
    const { db } = await withSnaps([]);
    const t = await teamTotals(db, {});
    expect(t.rushAttempts).toBe(0);
    expect(t.rushYards).toBe(0);
    // Null means "no carries", which is not the same as a longest of zero.
    expect(t.rushLongest).toBeNull();
    expect(t.passLongest).toBeNull();
  });

  it('counts rushing', async () => {
    const { db } = await withSnaps([
      run({ yardsGained: 4 }),
      run({ yardsGained: 12, isFirstDown: true }),
      run({ yardsGained: -2, fumbled: true, fumbleLost: true }),
      run({ yardsGained: 3, isTouchdown: true }),
    ]);
    const t = await teamTotals(db, {});
    expect(t).toMatchObject({
      rushAttempts: 4, rushYards: 17, rushTouchdowns: 1,
      rushFirstDowns: 1, rushLongest: 12, fumbles: 1, fumblesLost: 1,
      explosiveRuns: 1,
    });
  });

  it('does not count a sack as a pass attempt', async () => {
    const { db } = await withSnaps([
      pass({ isComplete: true, yardsGained: 20 }),
      pass({ isComplete: false }),
      // A sack is a PASS row, but counting it would inflate the denominator
      // of completion %, yards per attempt and every rating component.
      pass({ wasSacked: true, sackYards: -7 }),
    ]);
    const t = await teamTotals(db, {});
    expect(t.passAttempts).toBe(2);
    expect(t.completions).toBe(1);
    expect(t.sacks).toBe(1);
    expect(t.sackYards).toBe(-7);
    // An incompletion is an attempt but adds no yards.
    expect(t.passYards).toBe(20);
    expect(t.explosivePasses).toBe(1);
  });

  it('separates the two sides', async () => {
    const { db } = await withSnaps([
      run({ yardsGained: 10, possession: 'us' }),
      run({ yardsGained: 3, possession: 'them' }),
      run({ yardsGained: 4, possession: 'them' }),
    ]);
    expect((await teamTotals(db, { possession: 'us' })).rushYards).toBe(10);
    // Their offense is our defense: this is yards allowed.
    expect((await teamTotals(db, { possession: 'them' })).rushYards).toBe(7);
    expect((await teamTotals(db, {})).rushYards).toBe(17);
  });

  it('counts penalties by flag, not by kind', async () => {
    const { db } = await withSnaps([
      { kind: 'PENALTY', quarter: 1, hadPenalty: true, penaltyYards: 10 },
      { kind: 'PENALTY', quarter: 2, hadPenalty: true, penaltyYards: 5 },
      run({ yardsGained: 4 }),
    ]);
    const t = await teamTotals(db, {});
    expect(t.penalties).toBe(2);
    expect(t.penaltyYards).toBe(15);
  });
});

describe('downEfficiency', () => {
  it('converts on yardage when the first-down flag is unset', async () => {
    const { db } = await withSnaps([
      run({ down: 3, distance: 4, yardsGained: 6 }),   // converted
      run({ down: 3, distance: 4, yardsGained: 2 }),   // not
      run({ down: 3, distance: 4, yardsGained: 4 }),   // exactly enough
    ]);
    const rows = await downEfficiency(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ down: 3, plays: 3, converted: 2, yards: 12 });
  });

  it('honours the flag as an override and does not double-count', async () => {
    const { db } = await withSnaps([
      // Short of the sticks, but the coach marked a first down -- a
      // defensive penalty or a spot call.
      run({ down: 3, distance: 8, yardsGained: 2, isFirstDown: true }),
      // Both conditions true must still be one conversion.
      run({ down: 3, distance: 2, yardsGained: 9, isFirstDown: true }),
    ]);
    const rows = await downEfficiency(db, {});
    expect(rows[0]).toMatchObject({ plays: 2, converted: 2 });
  });

  it('does not treat goal-to-go at first and zero as automatic', async () => {
    const { db } = await withSnaps([
      run({ down: 1, distance: 0, yardsGained: 0 }),
      run({ down: 1, distance: 0, yardsGained: 1, isTouchdown: true }),
    ]);
    const rows = await downEfficiency(db, {});
    // Only the touchdown converts.
    expect(rows[0]).toMatchObject({ plays: 2, converted: 1 });
  });

  it('uses the sack loss rather than its zero gain', async () => {
    const { db } = await withSnaps([
      pass({ down: 2, distance: 10, wasSacked: true, sackYards: -8 }),
    ]);
    const rows = await downEfficiency(db, {});
    expect(rows[0]).toMatchObject({ plays: 1, converted: 0, yards: -8 });
  });

  it('ignores plays with no down, and orders by down', async () => {
    const { db } = await withSnaps([
      { kind: 'KICKOFF', quarter: 1, kickYards: 60 },
      run({ down: 2, distance: 6, yardsGained: 1 }),
      run({ down: 1, distance: 10, yardsGained: 4 }),
    ]);
    expect((await downEfficiency(db, {})).map((r) => r.down)).toEqual([1, 2]);
  });
});

describe('fieldZones', () => {
  it('buckets by distance to the goal the possessing team attacks', async () => {
    const { db } = await withSnaps([
      run({ ballPosition: 40, possession: 'us', yardsGained: 3 }),   // 10 to go: red
      run({ ballPosition: -40, possession: 'us' }),                  // 90 to go: own
      // Their yards to goal from -32 is 18, so this is their red zone too.
      run({ ballPosition: -32, possession: 'them', isTouchdown: true }),
    ]);
    const ours = await fieldZones(db, { possession: 'us' });
    expect(ours.find((z) => z.zone === 'red')).toMatchObject({ plays: 1, yards: 3 });
    expect(ours.find((z) => z.zone === 'own')).toMatchObject({ plays: 1 });

    const theirs = await fieldZones(db, { possession: 'them' });
    expect(theirs.find((z) => z.zone === 'red')).toMatchObject({ plays: 1, touchdowns: 1 });
  });

  it('returns zones in field order', async () => {
    const { db } = await withSnaps([
      run({ ballPosition: 45 }), run({ ballPosition: -45 }), run({ ballPosition: 0 }),
    ]);
    expect((await fieldZones(db, {})).map((z) => z.zone)).toEqual(['own', 'midfield', 'red']);
  });
});

describe('yardageBuckets', () => {
  it('always returns every bucket, in order', async () => {
    const { db } = await withSnaps([run({ yardsGained: 3 })]);
    const rows = await yardageBuckets(db, {});
    expect(rows.map((r) => r.bucket)).toEqual(['loss', 'none', '1-4', '5-9', '10-19', '20+']);
  });

  it('splits runs from passes and places a sack as a loss', async () => {
    const { db } = await withSnaps([
      run({ yardsGained: -3 }),
      run({ yardsGained: 0 }),
      run({ yardsGained: 7 }),
      pass({ isComplete: true, yardsGained: 25 }),
      pass({ wasSacked: true, sackYards: -6 }),
    ]);
    const rows = await yardageBuckets(db, {});
    const by = (b: string) => rows.find((r) => r.bucket === b)!;
    expect(by('loss')).toMatchObject({ runs: 1, passes: 1 });
    expect(by('none')).toMatchObject({ runs: 1, passes: 0 });
    expect(by('5-9')).toMatchObject({ runs: 1, passes: 0 });
    expect(by('20+')).toMatchObject({ runs: 0, passes: 1 });
  });
});
