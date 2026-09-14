import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer, seedRoster } from '../support/seed';
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

/** Jersey numbers on the seeded roster. Forms take the number now, not an id. */
const RB = 22;
const QB = 7;
const K = 3;


describe('recordPlay', () => {
  it('writes the play, scores it and advances the cursor', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 12, isFirstDown: true },
      roster,
    );

    expect(out.sequenceNumber).toBe(1);
    expect(out.teamScore).toBe(0);
    expect(out.cursor).toMatchObject({ down: 1, distance: 10, ballPosition: -13 });
    expect(out.entry.summary).toBe('#22 Danforth run for 12 yds');
    expect(await countSnaps(db, gameId)).toBe(1);
  });

  it('scores a touchdown and opens the extra point', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 25, isTouchdown: true },
      roster,
    );

    expect(out.teamScore).toBe(6);
    expect(out.cursor.situation).toBe('extra_point');
    expect(out.cursor.ballPosition).toBe(EXTRA_POINT_SPOT);
    expect(out.cursor.down).toBeNull();
    expect((await getGame(db, gameId))?.teamScore).toBe(6);
  });

  it('runs the touchdown, extra point and kickoff chain', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const td = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 40, isTouchdown: true },
      roster,
    );
    const pat = await recordPlay(
      db, gameId, td.cursor,
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerNumber: K },
      roster,
    );

    expect(pat.teamScore).toBe(7);
    expect(pat.cursor.situation).toBe('kickoff');
    expect(pat.cursor.ballPosition).toBe(KICKOFF_SPOT);

    const kick = await recordPlay(
      db, gameId, pat.cursor,
      { ...blankForm('kickoff'), kickerNumber: K, kickYards: 62, isTouchback: true },
      roster,
    );
    expect(kick.teamScore).toBe(7);
    expect(kick.cursor.down).toBe(1);
  });

  it('scores a defensive touchdown and opens the extra point', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const defTd = await recordPlay(
      db, gameId, { ...OPENING_CURSOR, possession: 'them' },
      { ...blankForm('pass'), isDefensiveTouchdown: true },
      roster,
    );

    expect(defTd.teamScore).toBe(6);
    expect(defTd.cursor.situation).toBe('extra_point');
    expect(defTd.cursor.possession).toBe('us');
    expect(defTd.cursor.ballPosition).toBe(EXTRA_POINT_SPOT);
    expect((await getGame(db, gameId))?.teamScore).toBe(6);
  });

  it('runs the defensive touchdown, extra point and kickoff chain', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const defTd = await recordPlay(
      db, gameId, { ...OPENING_CURSOR, possession: 'them' },
      { ...blankForm('run'), isDefensiveTouchdown: true },
      roster,
    );
    expect(defTd.teamScore).toBe(6);
    expect(defTd.cursor.situation).toBe('extra_point');

    const pat = await recordPlay(
      db, gameId, defTd.cursor,
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerNumber: K },
      roster,
    );

    expect(pat.teamScore).toBe(7);
    expect(pat.cursor.situation).toBe('kickoff');
    expect(pat.cursor.ballPosition).toBe(KICKOFF_SPOT);
  });

  it('scores two for a conversion and three for a field goal', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const two = await recordPlay(
      db, gameId, { ...OPENING_CURSOR, situation: 'extra_point', ballPosition: EXTRA_POINT_SPOT },
      { ...blankForm('extra_point'), attemptType: '2PT_RUN', result: 'GOOD' },
      roster,
    );
    expect(two.teamScore).toBe(2);

    const fg = await recordPlay(
      db, gameId, two.cursor,
      { ...blankForm('field_goal'), kickerNumber: K, kickDistance: 38, result: 'GOOD' },
      roster,
    );
    expect(fg.teamScore).toBe(5);
    expect(fg.cursor.situation).toBe('kickoff');
  });

  it('stores a sack as a loss rather than a gain', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('pass'), quarterbackNumber: QB, wasSacked: true, yardsGained: 7 },
      roster,
    );

    const snap = await getSnap(db, out.snapId);
    expect(snap?.yardsGained).toBe(0);
    expect(snap?.sackYards).toBe(-7);
    expect(out.entry.yards).toBe(-7);
    expect(out.entry.summary).toBe('#7 Okafor sacked for -7 yds');
  });

  it('zeroes the yardage of a declined penalty', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

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
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OPENING_CURSOR,
      { ...blankForm('kickoff'), kickerNumber: K, kickYards: 60 },
      roster,
    );

    // Django wrote the literal 35 here, which is the opponent's 15.
    const snap = await getSnap(db, out.snapId);
    expect(snap?.ballPosition).toBe(KICKOFF_SPOT);
    expect(snap?.ballPosition).toBe(-15);
    expect(snap?.down).toBeNull();
  });

  it('rejects an invalid play before writing anything', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 500 }, roster),
    ).rejects.toThrow(/Yards gained/);

    expect(await countSnaps(db, gameId)).toBe(0);
  });

  it('records an unrostered number without a player link', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    // The opponent's offence is never on our roster. Their #40 still has to
    // be recordable, and must not be attributed to one of our players.
    const out = await recordPlay(
      db, gameId, { ...OPENING_CURSOR, possession: 'them' },
      { ...blankForm('run'), ballCarrierNumber: 40, yardsGained: 6 }, roster,
    );

    const snap = await getSnap(db, out.snapId);
    expect(snap?.ballCarrierNumber).toBe(40);
    expect(snap?.ballCarrierId).toBeNull();
    expect(out.entry.summary).toBe('#40 run for 6 yds');
  });

  it('never resolves an opponent number against our roster', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    // We have a #22. Their #22 is a different person entirely.
    const out = await recordPlay(
      db, gameId, { ...OPENING_CURSOR, possession: 'them' },
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 3 }, roster,
    );

    const snap = await getSnap(db, out.snapId);
    expect(snap?.ballCarrierNumber).toBe(RB);
    expect(snap?.ballCarrierId).toBeNull();
    expect(out.entry.summary).toBe('#22 run for 3 yds');
  });

  it('links our own number to the roster player', async () => {
    const { db, gameId, rb, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 5 }, roster);

    const snap = await getSnap(db, out.snapId);
    expect(snap?.ballCarrierId).toBe(rb);
    expect(snap?.ballCarrierNumber).toBe(RB);
    expect(out.entry.summary).toBe('#22 Danforth run for 5 yds');
  });

  it('rolls the whole play back when the write fails', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    // On the roster we hold, but not in the database -- a foreign key
    // violation partway through the transaction.
    const ghost = makePlayer({ id: 4242, number: 99 });

    await expect(
      recordPlay(db, gameId, OPENING_CURSOR,
        { ...blankForm('run'), ballCarrierNumber: ghost.number, yardsGained: 8, isTouchdown: true },
        [...roster, ghost]),
    ).rejects.toThrow();

    // Neither the snap nor the six points survived.
    expect(await countSnaps(db, gameId)).toBe(0);
    expect((await getGame(db, gameId))?.teamScore).toBe(0);
  });

  it('keeps pointsFor and pointsForSnap in agreement for every form', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const forms: PlayForm[] = [
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 30, isTouchdown: true },
      { ...blankForm('pass'), quarterbackNumber: QB, receiverNumber: RB, isComplete: true, isTouchdown: true, yardsGained: 40 },
      { ...blankForm('field_goal'), kickerNumber: K, result: 'GOOD', kickDistance: 30 },
      { ...blankForm('field_goal'), kickerNumber: K, result: 'MISS', kickDistance: 48 },
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerNumber: K },
      { ...blankForm('extra_point'), attemptType: '2PT_PASS', result: 'GOOD' },
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'MISS', kickerNumber: K },
      { ...blankForm('punt'), punterNumber: K, puntYards: 40 },
      { ...blankForm('kickoff'), kickerNumber: K, kickYards: 60 },
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
    const { db, gameId } = await seedRoster(await createTestDb());
    await expect(undoLastPlay(db, gameId)).rejects.toThrow(/no play to undo/);
  });

  it('takes the points back off with the play', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 30, isTouchdown: true }, roster);
    expect((await getGame(db, gameId))?.teamScore).toBe(6);

    const undone = await undoLastPlay(db, gameId);
    expect(undone.teamScore).toBe(0);
    expect(undone.cursor).toEqual(OPENING_CURSOR);
    expect(await countSnaps(db, gameId)).toBe(0);
  });

  it('restores the touchdown state when undoing the extra point', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const td = await recordPlay(db, gameId, OPENING_CURSOR,
      { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 30, isTouchdown: true }, roster);
    await recordPlay(db, gameId, td.cursor,
      { ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD', kickerNumber: K }, roster);

    const undone = await undoLastPlay(db, gameId);

    // Django hardcoded situation:'normal' here, dropping the coach on the
    // play grid instead of back on the extra point.
    expect(undone.teamScore).toBe(6);
    expect(undone.cursor.situation).toBe('extra_point');
    expect(undone.cursor.ballPosition).toBe(EXTRA_POINT_SPOT);
  });

  it('unwinds a whole drive one play at a time', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    let cursor = OPENING_CURSOR;
    for (const yards of [4, 3, 5, 12]) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: yards }, roster)).cursor;
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
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    let cursor = OPENING_CURSOR;
    for (const yards of [4, 8]) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: yards }, roster)).cursor;
    }

    const snapshot = await loadTracker(db, gameId);
    expect(snapshot.team.abbreviation).toBe('NSR');
    expect(snapshot.game.opponent).toBe('Westfield');
    expect(snapshot.roster).toHaveLength(4);
    expect(snapshot.cursor).toEqual(cursor);
    // Newest play first, matching the live feed.
    expect(snapshot.feed.map((f) => f.sequenceNumber)).toEqual([2, 1]);
    expect(snapshot.feed[0].summary).toBe('#22 Danforth run for 8 yds');
  });

  it('caps the feed at fifteen plays', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    let cursor = OPENING_CURSOR;
    for (let i = 0; i < 20; i++) {
      cursor = (await recordPlay(db, gameId, cursor,
        { ...blankForm('run'), ballCarrierNumber: RB, yardsGained: 1 }, roster)).cursor;
    }

    const snapshot = await loadTracker(db, gameId);
    expect(snapshot.feed).toHaveLength(15);
    expect(snapshot.feed[0].sequenceNumber).toBe(20);
  });

  it('refuses a game that does not exist', async () => {
    const { db } = await seedRoster(await createTestDb());
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
