/**
 * Replay a real game.
 *
 * `replay.game.json` is a real 2024 NFL game (PHI at WAS, 33-36) taken from
 * public nflverse play-by-play, with every player name replaced by a
 * synthetic one and a jersey number. The football is real: the downs,
 * yardage, turnovers and scores all happened.
 *
 * Two things come out of it. The write path gets exercised against real
 * football rather than invented fixtures, and the state machine can be
 * scored against what actually occurred, because the NEXT real play tells us
 * the true next state.
 */
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../support/testDb';
import {
  US, fixture, realCursor, seedFromFixture, toForm,
  type Play,
} from '../support/replayFixture';
import { getGame, readGameCursor } from '../../src/lib/db/repositories/games';
import { listSnaps } from '../../src/lib/db/repositories/snaps';
import { recordPlay } from '../../src/lib/game/recordPlay';
import { rebuildCursor } from '../../src/lib/game/cursor';
import { playerLookup, summarize } from '../../src/lib/game/summary';
import type { Player } from '../../src/lib/db/repositories/types';

describe('replaying a real game', () => {
  it('records every play the tracker supports, and reports what it cannot', async () => {
    const db = await createTestDb();
    const { gameId, roster } = await seedFromFixture(db);

    const skipped: Record<string, number> = {};
    const failures: { play: Play; error: string }[] = [];
    let recorded = 0;

    for (const play of fixture.plays) {
      const cursor = realCursor(play);
      const form = toForm(play);
      if (!cursor || !form) {
        skipped[play.play_type] = (skipped[play.play_type] ?? 0) + 1;
        continue;
      }
      try {
        await recordPlay(db, gameId, cursor, form, roster as Player[]);
        recorded += 1;
      } catch (error) {
        failures.push({ play, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const report = [
      `recorded ${recorded} of ${fixture.plays.length} plays`,
      `skipped: ${Object.entries(skipped).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'}`,
      `failures: ${failures.length}`,
      ...failures.slice(0, 8).map((f) => `  ${f.play.play_type} q${f.play.qtr}: ${f.error}`),
    ].join('\n');
    console.log(report);

    expect(failures, report).toHaveLength(0);
    expect(recorded).toBeGreaterThan(140);
    expect(await listSnaps(db, gameId)).toHaveLength(recorded);
  });

  it('agrees with what actually happened on the next play', async () => {
    const db = await createTestDb();
    const { gameId, roster } = await seedFromFixture(db);

    let compared = 0;
    let exact = 0;
    const mismatches: string[] = [];

    for (let i = 0; i < fixture.plays.length - 1; i++) {
      const play = fixture.plays[i];
      const next = fixture.plays[i + 1];
      const cursor = realCursor(play);
      const form = toForm(play);
      if (!cursor || !form) continue;

      const outcome = await recordPlay(db, gameId, cursor, form, roster as Player[]);

      // Only scrimmage-to-scrimmage transitions inside one quarter are
      // comparable: a dead ball, a return or a quarter break has state this
      // app does not model.
      const truth = realCursor(next);
      if (!truth) continue;
      if (next.qtr !== play.qtr) continue;
      if (['kickoff', 'extra_point', 'no_play'].includes(next.play_type)) continue;
      if (['kickoff', 'punt', 'extra_point', 'field_goal', 'no_play'].includes(play.play_type)) continue;
      if (play.touchdown || play.safety || play.return_touchdown) continue;

      compared += 1;
      const ours = outcome.cursor;
      const samePossession = ours.possession === truth.possession;
      const samePosition = ours.ballPosition === truth.ballPosition;
      const sameDown = ours.down === truth.down;

      if (samePossession && samePosition && sameDown) exact += 1;
      else if (mismatches.length < 12) {
        const why = [
          play.sack ? 'SACK' : '',
          play.penalty_yards !== null ? `PEN${play.penalty_yards}` : '',
          next.penalty_yards !== null ? `NEXT-PEN${next.penalty_yards}` : '',
        ].filter(Boolean).join(' ') || '-';
        mismatches.push(
          `q${play.qtr} ${play.play_type} ${play.posteam} ${play.yards_gained}yd [${why}] ` +
          `in ${cursor.down}&${cursor.distance}@${cursor.ballPosition}: ` +
          `ours ${ours.possession}/${ours.ballPosition}/${ours.down}&${ours.distance} vs ` +
          `real ${truth.possession}/${truth.ballPosition}/${truth.down}&${truth.distance}`,
        );
      }
    }

    const rate = compared === 0 ? 0 : exact / compared;
    console.log(
      `state machine vs reality: ${exact}/${compared} exact (${(rate * 100).toFixed(1)}%)\n` +
      mismatches.map((m) => `  ${m}`).join('\n'),
    );

    // The remaining differences are all football this app does not model:
    // penalties nflverse records on the same row as the play (the tracker
    // takes those as their own play), and interception return yardage. A
    // drop below this means the state machine regressed.
    expect(rate, mismatches.join('\n')).toBeGreaterThan(0.93);
  });

  it('scores the game the way it actually finished', async () => {
    const db = await createTestDb();
    const { gameId, roster } = await seedFromFixture(db);

    for (const play of fixture.plays) {
      const cursor = realCursor(play);
      const form = toForm(play);
      if (!cursor || !form) continue;
      await recordPlay(db, gameId, cursor, form, roster as Player[]);
    }

    const last = fixture.plays[fixture.plays.length - 1];
    const realUs = US === fixture.home ? last.home_score : last.away_score;
    const realThem = US === fixture.home ? last.away_score : last.home_score;

    const game = await getGame(db, gameId);
    console.log(
      `final: ours ${game?.teamScore} (real ${realUs}), ` +
      `theirs ${game?.opponentScore} (real ${realThem})`,
    );

    expect(game?.teamScore).toBe(realUs);
    expect(game?.opponentScore).toBe(realThem);
  });

  it('produces the same offensive totals the game actually produced', async () => {
    const db = await createTestDb();
    const { gameId, roster } = await seedFromFixture(db);

    for (const play of fixture.plays) {
      const cursor = realCursor(play);
      const form = toForm(play);
      if (!cursor || !form) continue;
      await recordPlay(db, gameId, cursor, form, roster as Player[]);
    }

    const ours = (await listSnaps(db, gameId)).filter((s) => s.possession === 'us');
    const runs = ours.filter((s) => s.kind === 'RUN');
    const passes = ours.filter((s) => s.kind === 'PASS');
    const completions = passes.filter((s) => s.isComplete);

    const mine = {
      rushYards: runs.reduce((t, s) => t + s.yardsGained, 0),
      rushAttempts: runs.length,
      passYards: completions.reduce((t, s) => t + s.yardsGained, 0),
      completions: completions.length,
      attempts: passes.filter((s) => !s.wasSacked).length,
      sacks: passes.filter((s) => s.wasSacked).length,
      touchdowns: ours.filter((s) => s.isTouchdown).length,
      interceptions: ours.filter((s) => s.isInterception).length,
    };

    // The same numbers straight off the source data.
    const theirs = fixture.plays.filter((p) => p.posteam === US);
    // A two-point run is a conversion attempt, not a rushing attempt: the
    // tracker records it as an extra point, and so does the box score.
    const realRuns = theirs.filter(
      (p) => ['run', 'qb_kneel', 'qb_spike'].includes(p.play_type) && !p.two_point_conv_result,
    );
    const realPasses = theirs.filter((p) => p.play_type === 'pass' && !p.two_point_conv_result);
    const real = {
      rushYards: realRuns.reduce((t, p) => t + p.yards_gained, 0),
      rushAttempts: realRuns.length,
      passYards: realPasses.filter((p) => p.complete_pass).reduce((t, p) => t + p.yards_gained, 0),
      completions: realPasses.filter((p) => p.complete_pass).length,
      attempts: realPasses.filter((p) => !p.sack).length,
      sacks: realPasses.filter((p) => p.sack).length,
      touchdowns: theirs.filter((p) => p.touchdown && !p.return_touchdown).length,
      interceptions: theirs.filter((p) => p.interception).length,
    };

    console.log(
      `${US} offense — ours vs real\n` +
      Object.keys(real).map((k) => {
        const key = k as keyof typeof real;
        const flag = mine[key] === real[key] ? ' ' : '!';
        return `  ${flag} ${k.padEnd(14)} ${String(mine[key]).padStart(4)}  ${String(real[key]).padStart(4)}`;
      }).join('\n'),
    );

    expect(mine).toEqual(real);
  });

  it('leaves a clean, replayable record of the game', async () => {
    const db = await createTestDb();
    const { gameId, roster } = await seedFromFixture(db);

    for (const play of fixture.plays) {
      const cursor = realCursor(play);
      const form = toForm(play);
      if (!cursor || !form) continue;
      await recordPlay(db, gameId, cursor, form, roster as Player[]);
    }

    const snaps = await listSnaps(db, gameId);

    // Sequence numbers are contiguous from one, with no gaps or repeats.
    expect(snaps.map((s) => s.sequenceNumber)).toEqual(
      Array.from({ length: snaps.length }, (_, i) => i + 1),
    );

    // Every play carries a side, and both sides are represented.
    const sides = new Set(snaps.map((s) => s.possession));
    expect(sides).toEqual(new Set(['us', 'them']));

    // Our players are attributed; theirs are numbers without a link.
    const ourRuns = snaps.filter((s) => s.kind === 'RUN' && s.possession === 'us');
    const theirRuns = snaps.filter((s) => s.kind === 'RUN' && s.possession === 'them');
    expect(ourRuns.some((s) => s.ballCarrierId !== null)).toBe(true);
    expect(theirRuns.every((s) => s.ballCarrierId === null)).toBe(true);
    expect(theirRuns.some((s) => s.ballCarrierNumber !== null)).toBe(true);

    // Every play describes itself; none falls through to "Play #n".
    const players = playerLookup(roster as Player[]);
    const summaries = snaps.map((s) => summarize(s, players));
    expect(summaries.filter((line) => /^Play #/.test(line))).toHaveLength(0);

    // The cursor rebuilt from the plays matches the stored one, so a reload
    // mid-game lands exactly where the coach left off.
    expect(await rebuildCursor(db, gameId)).toEqual(await readGameCursor(db, gameId));

    console.log(
      `record: ${snaps.length} plays, ` +
      `${snaps.filter((s) => s.possession === 'us').length} ours / ` +
      `${snaps.filter((s) => s.possession === 'them').length} theirs\n` +
      `  first: ${summaries[0]}\n  last:  ${summaries[summaries.length - 1]}`,
    );
  });
});
