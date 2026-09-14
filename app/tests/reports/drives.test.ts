import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { fixture, replayGame } from '../support/replayFixture';
import { reportSnaps } from '../../src/lib/db/reports/snaps';
import { redZone, segmentDrives } from '../../src/lib/reports/drives';
import { makeSnap } from '../support/snapFixture';
import type { Snap } from '../../src/lib/db/repositories/types';

const seq = (n: number, over: Partial<Snap> = {}) =>
  makeSnap({ sequenceNumber: n, kind: 'RUN', quarter: 1, possession: 'us', ...over });

describe('segmentDrives', () => {
  it('breaks on a change of possession', () => {
    const drives = segmentDrives([
      seq(1), seq(2),
      seq(3, { possession: 'them' }), seq(4, { possession: 'them' }),
    ]);
    expect(drives).toHaveLength(2);
    expect(drives[0]).toMatchObject({ plays: 2, possession: 'us' });
    expect(drives[1]).toMatchObject({ plays: 2, possession: 'them' });
  });

  it('puts a kickoff in no drive, and ends the one before it', () => {
    const drives = segmentDrives([
      seq(1), seq(2),
      seq(3, { kind: 'KICKOFF' }),
      seq(4), seq(5),
    ]);
    expect(drives).toHaveLength(2);
    expect(drives.every((d) => d.plays === 2)).toBe(true);
  });

  it('ends a drive at the extra point, not after it', () => {
    const drives = segmentDrives([
      seq(1), seq(2, { isTouchdown: true }),
      seq(3, { kind: 'XP', attemptType: 'KICK', result: 'GOOD' }),
      seq(4),
    ]);
    expect(drives).toHaveLength(2);
    expect(drives[0].outcome).toBe('touchdown');
    // The try's point belongs to the try, not to the drive that preceded it.
    expect(drives[0].points).toBe(6);
  });

  it('keeps one drive across a quarter change with no kick between', () => {
    // The halftime case: same team, possession never changed.
    const drives = segmentDrives([seq(1, { quarter: 2 }), seq(2, { quarter: 3 })]);
    expect(drives).toHaveLength(1);
    expect(drives[0].plays).toBe(2);
  });

  it('reads the outcome off the play that ended it', () => {
    const cases: [Partial<Snap>, string][] = [
      [{ isTouchdown: true }, 'touchdown'],
      [{ kind: 'FG', result: 'GOOD' }, 'field_goal'],
      [{ kind: 'FG', result: 'MISS' }, 'missed_fg'],
      [{ kind: 'PUNT' }, 'punt'],
      [{ isInterception: true }, 'interception'],
      [{ fumbleLost: true }, 'fumble'],
      [{ down: 4 }, 'downs'],
      [{ down: 2 }, 'end_of_period'],
    ];
    for (const [over, outcome] of cases) {
      expect(segmentDrives([seq(1, over)])[0].outcome, outcome).toBe(outcome);
    }
  });

  it('measures yards toward the goal the drive was attacking', () => {
    // Ours: -30 to -10 is twenty yards forward.
    const ours = segmentDrives([seq(1, { ballPosition: -30 }), seq(2, { ballPosition: -10, yardsGained: 0 })]);
    expect(ours[0].startPosition).toBe(-30);
    expect(ours[0].yardsToGoalAtStart).toBe(80);

    // Theirs drives the other way, so the same arithmetic must flip.
    const theirs = segmentDrives([seq(1, { possession: 'them', ballPosition: 30 })]);
    expect(theirs[0].yardsToGoalAtStart).toBe(80);
  });

  it('is empty for no plays', () => {
    expect(segmentDrives([])).toEqual([]);
  });
});

describe('red zone', () => {
  it('counts trips, not plays', () => {
    const drives = segmentDrives([
      // One drive that reaches the twenty and stalls: one failed trip.
      seq(1, { ballPosition: 35 }), seq(2, { ballPosition: 38 }),
      seq(3, { ballPosition: 40, down: 4 }),
    ]);
    expect(redZone(drives)).toMatchObject({ trips: 1, touchdowns: 0, scorePct: 0 });
  });

  it('scores a trip that ended in points', () => {
    const drives = segmentDrives([
      seq(1, { ballPosition: 35 }), seq(2, { ballPosition: 45, isTouchdown: true }),
    ]);
    expect(redZone(drives)).toMatchObject({ trips: 1, touchdowns: 1, tdPct: 100, scorePct: 100 });
  });

  it('is zero, not NaN, with no trips', () => {
    expect(redZone([])).toEqual({ trips: 0, touchdowns: 0, fieldGoals: 0, scorePct: 0, tdPct: 0 });
  });
});

describe('against a real game', () => {
  it('segments the same drives nflverse did', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);
    const drives = segmentDrives(await reportSnaps(db, { gameIds: [gameId] }));

    // nflverse numbers 27 drives, but its 27th is a lone kickoff with no
    // play after it -- the game ended. A kickoff belongs to no drive here,
    // so the comparison is against drives that contain a real play.
    const bodies = new Map<number, number>();
    for (const play of fixture.plays) {
      if (play.drive === null) continue;
      if (['kickoff', 'extra_point', ''].includes(play.play_type)) continue;
      bodies.set(play.drive, (bodies.get(play.drive) ?? 0) + 1);
    }

    expect(drives).toHaveLength(bodies.size);
    expect(drives).toHaveLength(26);
  });

  it('alternates possession the way a real game does', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);
    const drives = segmentDrives(await reportSnaps(db, { gameIds: [gameId] }));

    expect(new Set(drives.map((d) => d.possession))).toEqual(new Set(['us', 'them']));
    // Both sides had a comparable number of possessions, as they must.
    const ours = drives.filter((d) => d.possession === 'us').length;
    expect(Math.abs(ours - (drives.length - ours))).toBeLessThanOrEqual(2);
  });

  it('accounts for every point through the drives and tries', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);
    const snaps = await reportSnaps(db, { gameIds: [gameId] });
    const drives = segmentDrives(snaps);

    // Drives carry touchdowns and field goals; the tries sit between them.
    const inDrives = drives.reduce((sum, d) => sum + d.points, 0);
    const betweenDrives = snaps
      .filter((s) => s.kind === 'XP')
      .reduce((sum, s) => sum + (s.result === 'GOOD' ? (s.attemptType === 'KICK' ? 1 : 2) : 0), 0);
    expect(inDrives + betweenDrives).toBe(36 + 33);
  });

  it('finds red zone trips on both sides', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);
    const drives = segmentDrives(await reportSnaps(db, { gameIds: [gameId] }));

    const ours = redZone(drives.filter((d) => d.possession === 'us'));
    const theirs = redZone(drives.filter((d) => d.possession === 'them'));
    expect(ours.trips).toBeGreaterThan(0);
    expect(theirs.trips).toBeGreaterThan(0);
    expect(ours.touchdowns).toBeGreaterThan(0);
  });
});
