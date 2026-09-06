/**
 * The report layer, checked against a real game.
 *
 * Every number below is computed twice: once by the SQL in
 * src/lib/db/reports, and once straight off the nflverse source data in the
 * fixture. That checks the SQL against REALITY rather than against another
 * implementation of the same idea.
 *
 * WHAT THIS FILE DOES NOT VALIDATE — see tests/support/replayFixture.ts. The
 * fixture hardcodes punt yards to 40, synthesises field goal distance, and
 * names every penalty 'Holding (Offense)'. So punting, field goal distance
 * and the penalty breakdown are artefacts of the harness, not football, and
 * are covered by shape tests in specialTeams.test.ts instead. Rushing,
 * passing, scoring, turnovers, downs and field position are real.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../support/testDb';
import { US, fixture, replayGame, type Play } from '../support/replayFixture';
import { downEfficiency, fieldZones, teamTotals } from '../../src/lib/db/reports/team';
import { rushingByPlayer } from '../../src/lib/db/reports/players';
import { reportSnaps } from '../../src/lib/db/reports/snaps';
import { pointsByQuarter } from '../../src/lib/reports/scoring';

/** Plays run by one side, excluding conversions and nflverse admin rows. */
const sidePlays = (team: string) => fixture.plays.filter((p) => p.posteam === team);

const isRush = (p: Play) =>
  ['run', 'qb_kneel', 'qb_spike'].includes(p.play_type) && !p.two_point_conv_result;
const isPass = (p: Play) => p.play_type === 'pass' && !p.two_point_conv_result;

/** The same totals the report SQL produces, taken off the source data. */
function realTotals(team: string) {
  const plays = sidePlays(team);
  const runs = plays.filter(isRush);
  const passes = plays.filter(isPass);
  const completions = passes.filter((p) => p.complete_pass);
  return {
    rushAttempts: runs.length,
    rushYards: runs.reduce((t, p) => t + p.yards_gained, 0),
    rushTouchdowns: runs.filter((p) => p.touchdown && !p.return_touchdown).length,
    passAttempts: passes.filter((p) => !p.sack).length,
    completions: completions.length,
    passYards: completions.reduce((t, p) => t + p.yards_gained, 0),
    passTouchdowns: passes.filter((p) => p.touchdown && !p.return_touchdown).length,
    interceptions: passes.filter((p) => p.interception).length,
    sacks: passes.filter((p) => p.sack).length,
    explosiveRuns: runs.filter((p) => p.yards_gained >= 10).length,
    explosivePasses: completions.filter((p) => p.yards_gained >= 15).length,
  };
}

const fromDb = (t: Awaited<ReturnType<typeof teamTotals>>) => ({
  rushAttempts: t.rushAttempts,
  rushYards: t.rushYards,
  rushTouchdowns: t.rushTouchdowns,
  passAttempts: t.passAttempts,
  completions: t.completions,
  passYards: t.passYards,
  passTouchdowns: t.passTouchdowns,
  interceptions: t.interceptions,
  sacks: t.sacks,
  explosiveRuns: t.explosiveRuns,
  explosivePasses: t.explosivePasses,
});

const THEM_TEAM = fixture.away;

describe('report SQL against a real game', () => {
  it('reproduces our offensive box score', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    const ours = await teamTotals(db, { gameIds: [gameId], possession: 'us' });
    expect(fromDb(ours)).toEqual(realTotals(US));
  });

  it('reproduces their offense, which is how defense is reported', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    // No defensive play form exists, so every defense_* column is null.
    // possession='them' is the only honest route to defensive numbers, and
    // this is the proof it is a valid one.
    const theirs = await teamTotals(db, { gameIds: [gameId], possession: 'them' });
    expect(fromDb(theirs)).toEqual(realTotals(THEM_TEAM));
  });

  it('keeps the two sides separate', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    const ours = await teamTotals(db, { gameIds: [gameId], possession: 'us' });
    const theirs = await teamTotals(db, { gameIds: [gameId], possession: 'them' });
    const both = await teamTotals(db, { gameIds: [gameId] });

    expect(both.rushYards).toBe(ours.rushYards + theirs.rushYards);
    expect(both.scrimmagePlays).toBe(ours.scrimmagePlays + theirs.scrimmagePlays);
    // The whole point: an unfiltered total is not an offensive total.
    expect(ours.rushYards).not.toBe(both.rushYards);
  });

  it('measures the turnover margin from both sides', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    const ours = await teamTotals(db, { gameIds: [gameId], possession: 'us' });
    const theirs = await teamTotals(db, { gameIds: [gameId], possession: 'them' });

    const giveaways = ours.interceptions + ours.fumblesLost;
    const takeaways = theirs.interceptions + theirs.fumblesLost;

    // Scrimmage turnovers only. The run, pass and penalty forms carry fumble
    // controls; the kickoff and punt forms do not, so a muffed kick cannot be
    // recorded as a turnover at all. That is a gap in the TRACKER, not in the
    // report, and this test names it rather than hiding it.
    const scrimmage = (p: Play) => isRush(p) || isPass(p);
    const realGiveaways = sidePlays(US)
      .filter((p) => scrimmage(p) && (p.interception || p.fumble_lost)).length;
    const realTakeaways = sidePlays(THEM_TEAM)
      .filter((p) => scrimmage(p) && (p.interception || p.fumble_lost)).length;

    expect(giveaways).toBe(realGiveaways);
    expect(takeaways).toBe(realTakeaways);

    // The gap, asserted so it cannot drift unnoticed: this game contains one
    // lost fumble on a kickoff that the tracker has no way to record. If a
    // fumble control is ever added to the kicking forms, this flips and the
    // test above should widen to every play.
    const unrecordable = fixture.plays.filter(
      (p) => !scrimmage(p) && (p.interception || p.fumble_lost),
    );
    expect(unrecordable).toHaveLength(1);
    expect(unrecordable[0].play_type).toBe('kickoff');
  });

  it('counts downs and conversions the same way the source data does', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    const rows = await downEfficiency(db, { gameIds: [gameId], possession: 'us' });

    // Mirrors the SQL definition, so this validates the PIPELINE end to end
    // -- not the football definition of a conversion, which the fixture
    // carries no column for.
    for (const row of rows) {
      const real = sidePlays(US).filter(
        (p) => (isRush(p) || isPass(p)) && p.down === row.down && p.ydstogo !== null,
      );
      expect(row.plays, `down ${row.down} plays`).toBe(real.length);
      const converted = real.filter(
        (p) => (p.touchdown && !p.return_touchdown) ||
               (p.ydstogo! > 0 && p.yards_gained >= p.ydstogo!),
      ).length;
      expect(row.converted, `down ${row.down} conversions`).toBe(converted);
    }
    expect(rows.map((r) => r.down)).toEqual([1, 2, 3, 4]);
  });

  it('places plays in the right field zone after a database round trip', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    for (const [side, team] of [['us', US], ['them', THEM_TEAM]] as const) {
      const zones = await fieldZones(db, { gameIds: [gameId], possession: side });
      const red = zones.find((z) => z.zone === 'red')?.plays ?? 0;

      // nflverse yardline_100 IS distance to the attacking goal, so this is
      // the strongest available check that the absolute frame survives the
      // round trip through SQLite.
      const realRed = sidePlays(team).filter(
        (p) => (isRush(p) || isPass(p)) && p.yardline_100 !== null && p.yardline_100 <= 20,
      ).length;
      expect(red, `${side} red zone`).toBe(realRed);
    }
  });

  it('reproduces the quarter-by-quarter scoring exactly', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);

    const snaps = await reportSnaps(db, { gameIds: [gameId] });
    const quarters = pointsByQuarter(snaps);

    // The real cumulative score at the end of each quarter, straight off the
    // source rows: 7-21, 14-21, 14-27, 36-33.
    const last = new Map<number, { home: number; away: number }>();
    for (const play of fixture.plays) {
      last.set(play.qtr, { home: play.home_score, away: play.away_score });
    }
    let previous = { home: 0, away: 0 };
    const real = [...last.keys()].sort().map((qtr) => {
      const cumulative = last.get(qtr)!;
      const delta = {
        quarter: qtr,
        us: cumulative.home - previous.home,
        them: cumulative.away - previous.away,
      };
      previous = cumulative;
      return delta;
    });

    // Derived from the plays, because quarter_scores is never written --
    // and it matches the real box score in every quarter, both sides.
    expect(quarters).toEqual(real);
    expect(quarters).toEqual([
      { quarter: 1, us: 7, them: 21 },
      { quarter: 2, us: 7, them: 0 },
      { quarter: 3, us: 0, them: 6 },
      { quarter: 4, us: 22, them: 6 },
    ]);

    // And the running total is the final score.
    const totals = quarters.reduce(
      (t, q) => ({ us: t.us + q.us, them: t.them + q.them }),
      { us: 0, them: 0 },
    );
    expect(totals).toEqual({ us: 36, them: 33 });
  });

  it('names real players in the leader board, and only ours', async () => {
    const db = await createTestDb();
    const { gameId, roster } = await replayGame(db);

    const rushers = await rushingByPlayer(db, { gameIds: [gameId] });
    expect(rushers.length).toBeGreaterThan(0);

    const ourNumbers = new Set(roster.map((p) => p.number));
    for (const line of rushers) expect(ourNumbers.has(line.number)).toBe(true);

    // Ordered by production, and totalling our rushing yards.
    const yards = rushers.map((r) => r.yards);
    expect([...yards].sort((a, b) => b - a)).toEqual(yards);
    const ours = await teamTotals(db, { gameIds: [gameId], possession: 'us' });
    expect(rushers.reduce((t, r) => t + r.yards, 0)).toBe(ours.rushYards);
  });
});
