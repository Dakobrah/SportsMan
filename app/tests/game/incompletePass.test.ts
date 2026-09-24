/**
 * An incomplete pass gains nothing.
 *
 * `airYards` and `yardsAfterCatch` were already gated on the completion, but
 * `yardsGained` was not, so a pass the coach marked incomplete still carried
 * whatever was in the yards field into the stored row -- and from there into
 * the ball position. The feed called it "pass incomplete" while the ball
 * moved, which is how it was noticed: three plays from our own 5 left the
 * ball sitting on our own goal line.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { seedRoster } from '../support/seed';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { blankForm } from '../../src/lib/game/playForm';
import { getSnap } from '../../src/lib/db/repositories/snaps';
import type { GameCursor } from '../../src/lib/game/cursor';

const OUR_20: GameCursor = {
  quarter: 1, down: 1, distance: 10,
  ballPosition: -30, situation: 'normal', possession: 'us',
};

describe('a pass that was not caught', () => {
  it('leaves the ball where it was, whatever the yards field says', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_20,
      { ...blankForm('pass'), isComplete: false, yardsGained: 5 },
      roster,
    );

    expect(out.cursor.ballPosition).toBe(-30);
    expect(out.cursor).toMatchObject({ down: 2, distance: 10 });
    expect((await getSnap(db, out.snapId))?.yardsGained).toBe(0);
    expect(out.entry.yards).toBe(0);
  });

  it('does not score a touchdown from the shadow of the goal line', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    // Them, first and goal on our 5 -- the demo's opening situation.
    const out = await recordPlay(
      db, gameId,
      { quarter: 4, down: 1, distance: 5, ballPosition: -45, situation: 'turnover', possession: 'them' },
      { ...blankForm('pass'), isComplete: false, yardsGained: 5 },
      roster,
    );

    expect(out.opponentScore).toBe(0);
    expect(out.cursor.ballPosition).toBe(-45);
    expect(out.cursor.situation).toBe('normal');
  });

  it('still records a completion that gains ground', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_20,
      { ...blankForm('pass'), isComplete: true, yardsGained: 5, airYards: 5 },
      roster,
    );

    expect(out.cursor.ballPosition).toBe(-25);
    expect(out.entry.yards).toBe(5);
  });

  it('keeps a sack losing ground through sackYards', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(
      db, gameId, OUR_20,
      { ...blankForm('pass'), wasSacked: true, isComplete: false, yardsGained: 8 },
      roster,
    );

    expect((await getSnap(db, out.snapId))?.sackYards).toBe(-8);
    expect(out.cursor.ballPosition).toBe(-38);
  });
});
