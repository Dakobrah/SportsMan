import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { makePlayer } from '../support/snapFixture';
import {
  loadTracker,
  recordPlay,
  toSnapRow,
  undoLastPlay,
} from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR } from '../../src/lib/game/cursor';
import { blankForm, type PlayForm } from '../../src/lib/game/playForm';
import { pointsFor, pointsForSnap } from '../../src/lib/game/score';
import { EXTRA_POINT_SPOT, KICKOFF_SPOT } from '../../src/lib/game/field';
import { countSnaps, getSnap } from '../../src/lib/db/repositories/snaps';
import { getGame } from '../../src/lib/db/repositories/games';
import { getPlayer } from '../../src/lib/db/repositories/players';

async function setup() {
  const db = await createTestDb();
  const { teamId, gameId } = await seedGame(db);
  const rb = await seedPlayer(db, teamId, { lastName: 'Danforth', position: 'RB', number: 22 });
  const qb = await seedPlayer(db, teamId, { lastName: 'Okafor', position: 'QB', number: 7 });
  const k = await seedPlayer(db, teamId, { lastName: 'Bell', position: 'K', number: 3 });
  const roster = (await Promise.all([rb, qb, k].map((id) => getPlayer(db, id)))).filter(
    (p): p is NonNullable<typeof p> => p != null,
  );
  return { db, gameId, rb, qb, k, roster };
}

describe('recordPlay', () => {
  it('writes the play, scores it and advances the cursor', async () => {
    const { db, gameId, rb, roster } = await setup();

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 12, isFirstDown: true },
      roster,
    );

    expect(out.sequenceNumber).toBe(1);
    expect(out.teamScore).toBe(0);
    expect(out.cursor).toMatchObject({ down: 1, distance: 10, ballPosition: -13 });
    expect(out.entry.summary).toBe('#22 Danforth run for 12 yds');
    expect(await countSnaps(db, gameId)).toBe(1);
  });

  it('scores a touchdown and opens the extra point', async () => {
    const { db, gameId, rb, roster } = await setup();

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 25, isTouchdown: true },
      roster,
    );

    expect(out.teamScore).toBe(6);
    expect(out.cursor.situation).toBe('extra_point');
    expect(out.cursor.ballPosition).toBe(EXTRA_POINT_SPOT);
    expect(out.cursor.down).toBeNull();
    expect((await getGame(db, gameId))?.teamScore).toBe(6);
  });

  it('runs the touchdown, extra point and kickoff chain', async () => {
    const { db, gameId, rb, k, roster } = await setup();

    const td = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 40, isTouchdown: true },
      roster,
    );
    const pat = await recordPlay(
      db, gameId, td.cursor,
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerId: k },
      roster,
    );

    expect(pat.teamScore).toBe(7);
    expect(pat.cursor.situation).toBe('kickoff');
    expect(pat.cursor.ballPosition).toBe(KICKOFF_SPOT);

    const kick = await recordPlay(
      db, gameId, pat.cursor,
      { ...blankForm('kickoff'), kickerId: k, kickYards: 62, isTouchback: true },
      roster,
    );
    expect(kick.teamScore).toBe(7);
    expect(kick.cursor.down).toBe(1);
  });

  it('scores two for a conversion and three for a field goal', async () => {
    const { db, gameId, k, roster } = await setup();

    const two = await recordPlay(
      db, gameId, { ...OPENING_CURSOR, situation: 'extra_point', ballPosition: EXTRA_POINT_SPOT },
      { ...blankForm('extra_point'), attemptType: '2PT_RUN', result: 'GOOD' },
      roster,
    );
    expect(two.teamScore).toBe(2);

    const fg = await recordPlay(
      db, gameId, two.cursor,
      { ...blankForm('field_goal'), kickerId: k, kickDistance: 38, result: 'GOOD' },
      roster,
    );
    expect(fg.teamScore).toBe(5);
    expect(fg.cursor.situation).toBe('kickoff');
  });

  it('stores a sack as a loss rather than a gain', async () => {
    const { db, gameId, qb, roster } = await setup();

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('pass'), quarterbackId: qb, wasSacked: true, yardsGained: 7 },
      roster,
    );

    const snap = await getSnap(db, out.snapId);
    expect(snap?.yardsGained).toBe(0);
    expect(snap?.sackYards).toBe(-7);
    expect(out.entry.yards).toBe(-7);
    expect(out.entry.summary).toBe('#7 Okafor sacked for -7 yds');
  });

  it('zeroes the yardage of a declined penalty', async () => {
    const { db, gameId, roster } = await setup();

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('penalty'), penaltyName: 'False Start', penaltyYards: 5, accepted: false },
      roster,
    );

    const snap = await getSnap(db, out.snapId);
    expect(snap?.penaltyYards).toBe(0);
    expect(snap?.penaltyAccepted).toBe(false);
  });

  it('puts a kickoff at the kickoff spot, not the opponent’s 15', async () => {
    const { db, gameId, k, roster } = await setup();

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('kickoff'), kickerId: k, kickYards: 60 },
      roster,
    );

    // Django wrote the literal 35 here, which is the opponent's 15.
    const snap = await getSnap(db, out.snapId);
    expect(snap?.ballPosition).toBe(KICKOFF_SPOT);
    expect(snap?.ballPosition).toBe(-15);
    expect(snap?.down).toBeNull();
  });

  it('rejects an invalid play before writing anything', async () => {
    const { db, gameId, rb, roster } = await setup();

    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        { ...blankForm('run'), ballCarrierId: rb, yardsGained: 500 }, roster),
    ).rejects.toThrow(/Yards gained/);

    expect(await countSnaps(db, gameId)).toBe(0);
  });

  it('rejects a player who is not on the roster', async () => {
    const { db, gameId, roster } = await setup();
    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        { ...blankForm('run'), ballCarrierId: 999 }, roster),
    ).rejects.toThrow(/roster/);
    expect(await countSnaps(db, gameId)).toBe(0);
  });

  it('rolls the whole play back when the write fails', async () => {
    const { db, gameId, roster } = await setup();

    // On the roster we hold, but not in the database -- a foreign key
    // violation partway through the transaction.
    const ghost = makePlayer({ id: 4242, number: 99 });

    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        { ...blankForm('run'), ballCarrierId: ghost.id, yardsGained: 8, isTouchdown: true },
        [...roster, ghost]),
    ).rejects.toThrow();

    // Neither the snap nor the six points survived.
    expect(await countSnaps(db, gameId)).toBe(0);
    expect((await getGame(db, gameId))?.teamScore).toBe(0);
  });

  it('keeps pointsFor and pointsForSnap in agreement for every form', async () => {
    const { db, gameId, rb, qb, k, roster } = await setup();

    const forms: PlayForm[] = [
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 30, isTouchdown: true },
      { ...blankForm('pass'), quarterbackId: qb, receiverId: rb, isComplete: true, isTouchdown: true, yardsGained: 40 },
      { ...blankForm('field_goal'), kickerId: k, result: 'GOOD', kickDistance: 30 },
      { ...blankForm('field_goal'), kickerId: k, result: 'MISS', kickDistance: 48 },
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerId: k },
      { ...blankForm('extra_point'), attemptType: '2PT_PASS', result: 'GOOD' },
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'MISS', kickerId: k },
      { ...blankForm('punt'), punterId: k, puntYards: 40 },
      { ...blankForm('kickoff'), kickerId: k, kickYards: 60 },
      { ...blankForm('penalty'), penaltyName: 'Holding (Offense)', penaltyYards: 10 },
    ];

    for (const form of forms) {
      const out = await recordPlay(db, gameId, OPENING_CURSOR, form, roster);
      const snap = await getSnap(db, out.snapId);
      // The two directions of one scoring rule must never disagree.
      expect(pointsForSnap(snap!)).toBe(pointsFor(form));
    }
  });

  it('round-trips every form through toSnapRow with the right kind', () => {
    const kinds = {
      run: 'RUN', pass: 'PASS', penalty: 'PENALTY', kickoff: 'KICKOFF',
      punt: 'PUNT', field_goal: 'FG', extra_point: 'XP',
    } as const;

    for (const [type, kind] of Object.entries(kinds)) {
      const row = toSnapRow(blankForm(type as keyof typeof kinds), OPENING_CURSOR);
      expect(row.kind).toBe(kind);
      expect(row.quarter).toBe(OPENING_CURSOR.quarter);
    }
  });
});

describe('undoLastPlay', () => {
  it('refuses when there is nothing to undo', async () => {
    const { db, gameId } = await setup();
    await expect(undoLastPlay(db, gameId)).rejects.toThrow(/no play to undo/);
  });

  it('takes the points back off with the play', async () => {
    const { db, gameId, rb, roster } = await setup();

    await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 30, isTouchdown: true }, roster);
    expect((await getGame(db, gameId))?.teamScore).toBe(6);

    const undone = await undoLastPlay(db, gameId);
    expect(undone.teamScore).toBe(0);
    expect(undone.cursor).toEqual(OPENING_CURSOR);
    expect(await countSnaps(db, gameId)).toBe(0);
  });

  it('restores the touchdown state when undoing the extra point', async () => {
    const { db, gameId, rb, k, roster } = await setup();

    const td = await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierId: rb, yardsGained: 30, isTouchdown: true }, roster);
    await recordPlay(db, gameId, td.cursor,
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerId: k }, roster);

    const undone = await undoLastPlay(db, gameId);

    // Django hardcoded situation:'normal' here, dropping the coach on the
    // play grid instead of back on the extra point.
    expect(undone.teamScore).toBe(6);
    expect(undone.cursor.situation).toBe('extra_point');
    expect(undone.cursor.ballPosition).toBe(EXTRA_POINT_SPOT);
  });

  it('unwinds a whole drive one play at a time', async () => {
    const { db, gameId, rb, roster } = await setup();

    let cursor = OPENING_CURSOR;
    for (const yards of [4, 3, 5, 12]) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierId: rb, yardsGained: yards }, roster)).cursor;
    }
    expect(await countSnaps(db, gameId)).toBe(4);

    for (let remaining = 3; remaining >= 0; remaining--) {
      await undoLastPlay(db, gameId);
      expect(await countSnaps(db, gameId)).toBe(remaining);
    }
    expect((await undoLastPlay(db, gameId).catch((e) => e)).code).toBe('nothing_to_undo');
  });
});

describe('loadTracker', () => {
  it('gathers the game, roster, cursor and recent plays', async () => {
    const { db, gameId, rb, roster } = await setup();

    let cursor = OPENING_CURSOR;
    for (const yards of [4, 8]) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierId: rb, yardsGained: yards }, roster)).cursor;
    }

    const snapshot = await loadTracker(db, gameId);
    expect(snapshot.team.abbreviation).toBe('NSR');
    expect(snapshot.game.opponent).toBe('Westfield');
    expect(snapshot.roster).toHaveLength(3);
    expect(snapshot.cursor).toEqual(cursor);
    // Newest play first, matching the live feed.
    expect(snapshot.feed.map((f) => f.sequenceNumber)).toEqual([2, 1]);
    expect(snapshot.feed[0].summary).toBe('#22 Danforth run for 8 yds');
  });

  it('caps the feed at fifteen plays', async () => {
    const { db, gameId, rb, roster } = await setup();

    let cursor = OPENING_CURSOR;
    for (let i = 0; i < 20; i++) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierId: rb, yardsGained: 1 }, roster)).cursor;
    }

    const snapshot = await loadTracker(db, gameId);
    expect(snapshot.feed).toHaveLength(15);
    expect(snapshot.feed[0].sequenceNumber).toBe(20);
  });

  it('refuses a game that does not exist', async () => {
    const { db } = await setup();
    await expect(loadTracker(db, 999)).rejects.toThrow(/does not exist/);
  });

  it('excludes retired players from the roster it hands the tracker', async () => {
    const db = await createTestDb();
    const { teamId, gameId } = await seedGame(db);
    await seedPlayer(db, teamId, { number: 22 });
    await seedPlayer(db, teamId, { number: 55, isActive: false });

    expect((await loadTracker(db, gameId)).roster.map((p) => p.number)).toEqual([22]);
  });
});
