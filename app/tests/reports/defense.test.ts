/**
 * Defensive attribution.
 *
 * The model under test: defensive detail rides on the OPPONENT'S offensive
 * snap. One play happened, so one row records it -- a separate defensive row
 * per play would double every play count and break the sequence numbering
 * that the cursor and drive segmentation depend on.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { JERSEY, seedRoster } from '../support/seed';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { OPENING_CURSOR } from '../../src/lib/game/cursor';
import { blankForm } from '../../src/lib/game/playForm';
import { assistsByPlayer, defenseByPlayer, defenseTotals } from '../../src/lib/db/reports/defense';
import { teamTotals } from '../../src/lib/db/reports/team';
import { listAssists, listSnaps } from '../../src/lib/db/repositories/snaps';

/** Their ball, so our defense is on the field. */
const THEIR_BALL = { ...OPENING_CURSOR, possession: 'them' as const };

describe('defensive attribution', () => {
  it('records a tackler on their run without adding a second play', async () => {
    const { db, gameId, roster, rb } = await seedRoster(await createTestDb());

    const out = await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('run'),
      ballCarrierNumber: 30,          // theirs, not on our roster
      yardsGained: 3,
      tacklerNumber: JERSEY.rb,       // ours
      tackleForLoss: false,
    }, roster);

    // One play, one row.
    expect(await listSnaps(db, gameId)).toHaveLength(1);

    const snaps = await listSnaps(db, gameId);
    expect(snaps[0].kind).toBe('RUN');
    expect(snaps[0].possession).toBe('them');
    // Their carrier has a number and no link; our tackler has both.
    expect(snaps[0].ballCarrierId).toBeNull();
    expect(snaps[0].ballCarrierNumber).toBe(30);
    expect(snaps[0].primaryPlayerId).toBe(rb);
    expect(snaps[0].primaryPlayerNumber).toBe(JERSEY.rb);

    expect(out.entry.summary).toContain('#30');
  });

  it('resolves a defender against our roster even though they have the ball', async () => {
    const { db, gameId, roster, qb } = await seedRoster(await createTestDb());

    // The ordinary jersey rule refuses to link an opponent number. A
    // defender is ours regardless of who has possession, so it must not
    // apply here.
    await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('pass'),
      quarterbackNumber: 12,
      tacklerNumber: JERSEY.qb,
    }, roster);

    expect((await listSnaps(db, gameId))[0].primaryPlayerId).toBe(qb);
  });

  it('counts tackles, sacks, pressures and pass breakups', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('run'), ballCarrierNumber: 30, yardsGained: -2,
      tacklerNumber: JERSEY.rb, tackleForLoss: true,
    }, roster);
    await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('pass'), quarterbackNumber: 12, wasSacked: true, yardsGained: 7,
      tacklerNumber: JERSEY.qb,
    }, roster);
    await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('pass'), quarterbackNumber: 12, isComplete: false,
      tacklerNumber: JERSEY.wr, forcedIncompletion: true, appliedPressure: true,
    }, roster);

    expect(await defenseTotals(db, { gameIds: [gameId] })).toMatchObject({
      tackles: 3, tacklesForLoss: 1, sacks: 1,
      passesDefended: 1, pressures: 1, unattributed: 0,
    });
  });

  it('reports the attribution gap rather than hiding it', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    await recordPlay(db, gameId, THEIR_BALL,
      { ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 5 }, roster);
    await recordPlay(db, gameId, THEIR_BALL,
      { ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 4, tacklerNumber: JERSEY.rb },
      roster);

    // A coach who does not enter a tackler still gets yards allowed; the
    // count of plays with nobody credited says how complete the picture is.
    const totals = await defenseTotals(db, { gameIds: [gameId] });
    expect(totals).toMatchObject({ tackles: 1, unattributed: 1 });
    expect((await teamTotals(db, { gameIds: [gameId], possession: 'them' })).rushYards).toBe(9);
  });

  it('groups by defender, most tackles first', async () => {
    const { db, gameId, roster, rb, qb } = await seedRoster(await createTestDb());

    for (const tacklerNumber of [JERSEY.rb, JERSEY.rb, JERSEY.qb]) {
      await recordPlay(db, gameId, THEIR_BALL, {
        ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 2, tacklerNumber,
      }, roster);
    }

    const lines = await defenseByPlayer(db, { gameIds: [gameId] });
    expect(lines.map((l) => l.playerId)).toEqual([rb, qb]);
    expect(lines[0]).toMatchObject({ tackles: 2, lastName: 'Danforth' });
  });

  it('never credits our own offensive plays to the defense', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    // Our ball. A tackler on this row would be nonsense, and the query
    // scopes to their possession so it cannot appear either way.
    await recordPlay(db, gameId, OPENING_CURSOR, {
      ...blankForm('run'), ballCarrierNumber: JERSEY.rb, yardsGained: 8,
      tacklerNumber: JERSEY.qb,
    }, roster);

    expect(await defenseByPlayer(db, { gameIds: [gameId] })).toHaveLength(0);
    expect((await defenseTotals(db, { gameIds: [gameId] })).tackles).toBe(0);
  });

  it('writes assists in the same transaction as the play', async () => {
    const { db, gameId, roster, qb, wr } = await seedRoster(await createTestDb());

    const out = await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 1,
      tacklerNumber: JERSEY.rb, assistNumbers: [JERSEY.qb, JERSEY.wr],
    }, roster);

    const assists = await listAssists(db, out.snapId);
    expect(assists.map((a) => a.playerId).sort()).toEqual([qb, wr].sort());
    expect(assists.every((a) => a.assistType === 'TACKLE')).toBe(true);
  });

  it('files an assist on a sack as a sack assist', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('pass'), quarterbackNumber: 12, wasSacked: true, yardsGained: 6,
      tacklerNumber: JERSEY.rb, assistNumbers: [JERSEY.qb],
    }, roster);

    expect((await listAssists(db, out.snapId))[0].assistType).toBe('SACK');
  });

  it('rolls assists up per player', async () => {
    const { db, gameId, roster, qb } = await seedRoster(await createTestDb());

    for (let i = 0; i < 2; i++) {
      await recordPlay(db, gameId, THEIR_BALL, {
        ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 2,
        tacklerNumber: JERSEY.rb, assistNumbers: [JERSEY.qb],
      }, roster);
    }

    const lines = await assistsByPlayer(db, { gameIds: [gameId] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ playerId: qb, tackleAssists: 2, sackAssists: 0 });
  });

  it('ignores an assist number that is not on our roster', async () => {
    const { db, gameId, roster } = await seedRoster(await createTestDb());

    const out = await recordPlay(db, gameId, THEIR_BALL, {
      ...blankForm('run'), ballCarrierNumber: 30, yardsGained: 2,
      tacklerNumber: JERSEY.rb, assistNumbers: [JERSEY.qb, 99],
    }, roster);

    // defense_assists has a real foreign key, so an unknown number is
    // dropped rather than failing the play.
    expect(await listAssists(db, out.snapId)).toHaveLength(1);
  });
});
