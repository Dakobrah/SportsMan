/**
 * Reaching the goal line IS the touchdown.
 *
 * The TD toggle was the only thing that scored a play, so a run or a
 * completed pass that carried the ball into the end zone was recorded as an
 * ordinary gain: no six points, no TD in the feed, and the next snap set up
 * as first and goal on the goal line instead of the try. The demo game opens
 * on exactly that situation -- them, first and goal on our 5 -- which is how
 * it was found.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedRoster } from '../support/seed';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { blankForm } from '../../src/lib/game/playForm';
import { EXTRA_POINT_SPOT } from '../../src/lib/game/field';
import { getSnap } from '../../src/lib/db/repositories/snaps';
import type { GameCursor } from '../../src/lib/game/cursor';

/** The demo game's opening cursor, straight out of `demo/seed.json`. */
const THEIR_GOAL_TO_GO: GameCursor = {
  quarter: 4,
  down: 1,
  distance: 5,
  ballPosition: -45,
  situation: 'turnover',
  possession: 'them',
};

/** Ours, mirrored: first and goal on the opponent's 5. */
const OUR_GOAL_TO_GO: GameCursor = {
  quarter: 1,
  down: 1,
  distance: 5,
  ballPosition: 45,
  situation: 'normal',
  possession: 'us',
};

describe('a play that reaches the goal line', () => {
  it('is their touchdown when they run it in', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, THEIR_GOAL_TO_GO,
      { ...blankForm('run'), yardsGained: 5 },
      roster,
    );

    expect(out.opponentScore).toBe(6);
    expect(out.teamScore).toBe(0);
    expect(out.entry.isTouchdown).toBe(true);
    expect((await getSnap(db, out.snapId))?.isTouchdown).toBe(true);
    expect(out.cursor).toMatchObject({
      situation: 'extra_point',
      possession: 'them',
      ballPosition: -47,
    });
  });

  it('is our touchdown on a completed pass into the end zone', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_GOAL_TO_GO,
      { ...blankForm('pass'), isComplete: true, yardsGained: 5, airYards: 5 },
      roster,
    );

    expect(out.teamScore).toBe(6);
    expect(out.cursor).toMatchObject({
      situation: 'extra_point',
      possession: 'us',
      ballPosition: EXTRA_POINT_SPOT,
    });
  });

  it('scores once, not twice, when the coach also pressed TD', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_GOAL_TO_GO,
      { ...blankForm('run'), yardsGained: 5, isTouchdown: true },
      roster,
    );

    expect(out.teamScore).toBe(6);
  });

  it('leaves a play that stops short alone', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_GOAL_TO_GO,
      { ...blankForm('run'), yardsGained: 4 },
      roster,
    );

    expect(out.teamScore).toBe(0);
    expect(out.cursor).toMatchObject({ situation: 'normal', ballPosition: 49, down: 2 });
  });

  it('is not a touchdown when the pass fell incomplete', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_GOAL_TO_GO,
      { ...blankForm('pass'), isComplete: false, yardsGained: 0 },
      roster,
    );

    expect(out.teamScore).toBe(0);
    expect(out.cursor.situation).toBe('normal');
  });

  it('is not the offence scoring when the ball was returned the other way', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, THEIR_GOAL_TO_GO,
      { ...blankForm('run'), yardsGained: 5, fumbled: true, fumbleLost: true },
      roster,
    );

    expect(out.opponentScore).toBe(0);
    expect(out.cursor.possession).toBe('us');
  });
});
