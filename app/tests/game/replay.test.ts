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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../support/testDb';
import type { Database } from '../../src/lib/db/driver';
import { createTeam } from '../../src/lib/db/repositories/teams';
import { createSeason } from '../../src/lib/db/repositories/seasons';
import { createPlayer, rosterForGame } from '../../src/lib/db/repositories/players';
import { createGame, getGame } from '../../src/lib/db/repositories/games';
import { listSnaps } from '../../src/lib/db/repositories/snaps';
import { recordPlay } from '../../src/lib/game/recordPlay';
import type { GameCursor } from '../../src/lib/game/cursor';
import { blankForm, type PlayForm } from '../../src/lib/game/playForm';
import type { Player, Position } from '../../src/lib/db/repositories/types';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

interface Play {
  id: number; qtr: number; drive: number;
  posteam: string; defteam: string;
  yardline_100: number | null; down: number | null; ydstogo: number | null;
  play_type: string; yards_gained: number;
  touchdown: boolean; td_team: string | null; return_touchdown: boolean;
  interception: boolean; fumble_lost: boolean; sack: boolean; complete_pass: boolean;
  field_goal_result: string | null; extra_point_result: string | null;
  two_point_conv_result: string | null;
  punt_blocked: boolean; touchback: boolean; safety: boolean;
  penalty_yards: number | null; penalty_team: string | null;
  home_score: number; away_score: number;
  actors: Partial<Record<'passer' | 'rusher' | 'receiver' | 'kicker' | 'punter', number>>;
}

interface Fixture {
  game: string; home: string; away: string;
  roster: { name: string; number: number; position: string; team: string }[];
  plays: Play[];
}

const fixture: Fixture = JSON.parse(readFileSync(join(fixtures, 'replay.game.json'), 'utf8'));

/** We keep book for the home team. */
const US = fixture.home;
const THEM = fixture.away;

/**
 * nflverse `yardline_100` is the distance to the end zone the possessing
 * team is attacking. Our frame is absolute: -50 is the end zone WE defend.
 */
function toAbsolute(yardline100: number, posteam: string): number {
  return posteam === US ? 50 - yardline100 : yardline100 - 50;
}

const possessionOf = (posteam: string): 'us' | 'them' => (posteam === US ? 'us' : 'them');

/** Build the form our tracker would submit for this real play. */
function toForm(play: Play): PlayForm | null {
  const a = play.actors;

  if (play.two_point_conv_result) {
    return {
      ...blankForm('extra_point'),
      attemptType: play.play_type === 'pass' ? '2PT_PASS' : '2PT_RUN',
      result: play.two_point_conv_result === 'success' ? 'GOOD' : 'MISS',
    };
  }

  switch (play.play_type) {
    case 'run':
    case 'qb_kneel':
    case 'qb_spike':
      return {
        ...blankForm('run'),
        ballCarrierNumber: a.rusher ?? null,
        yardsGained: play.yards_gained,
        isTouchdown: play.touchdown && !play.return_touchdown,
        fumbled: play.fumble_lost,
        fumbleLost: play.fumble_lost,
      };

    case 'pass':
      return {
        ...blankForm('pass'),
        quarterbackNumber: a.passer ?? null,
        receiverNumber: a.receiver ?? null,
        isComplete: play.complete_pass,
        wasSacked: play.sack,
        yardsGained: play.sack ? Math.abs(play.yards_gained) : play.yards_gained,
        isTouchdown: play.touchdown && !play.return_touchdown,
        isInterception: play.interception,
        fumbled: play.fumble_lost,
        fumbleLost: play.fumble_lost,
      };

    case 'punt':
      return {
        ...blankForm('punt'),
        punterNumber: a.punter ?? null,
        // nflverse records return yards here, so distance comes from the
        // resulting field position rather than this column.
        puntYards: 40,
        isTouchback: play.touchback,
        isBlocked: play.punt_blocked,
      };

    case 'field_goal':
      return {
        ...blankForm('field_goal'),
        kickerNumber: a.kicker ?? null,
        kickDistance: play.yardline_100 !== null ? play.yardline_100 + 17 : 30,
        result: play.field_goal_result === 'made' ? 'GOOD'
          : play.field_goal_result === 'blocked' ? 'BLOCK' : 'MISS',
      };

    case 'extra_point':
      return {
        ...blankForm('extra_point'),
        attemptType: 'KICK',
        kickerNumber: a.kicker ?? null,
        result: play.extra_point_result === 'good' ? 'GOOD' : 'MISS',
      };

    case 'kickoff':
      return {
        ...blankForm('kickoff'),
        kickerNumber: a.kicker ?? null,
        kickYards: 60,
        isTouchback: play.touchback,
      };

    case 'no_play':
      if (play.penalty_yards === null) return null;
      return {
        ...blankForm('penalty'),
        penaltyName: 'Holding (Offense)',
        penaltyYards: Math.abs(play.penalty_yards),
        onOffense: play.penalty_team === play.posteam,
        accepted: true,
      };

    default:
      return null;
  }
}

async function seedFromFixture(db: Database) {
  const teamId = await createTeam(db, { name: US, abbreviation: US });
  const seasonId = await createSeason(db, { year: 2024, teamId });
  const gameId = await createGame(db, {
    seasonId, date: '2024-12-22', opponent: THEM,
    location: 'home', weather: 'cold', fieldCondition: 'grass',
  });
  for (const person of fixture.roster.filter((p) => p.team === US)) {
    const [firstName, lastName] = person.name.split(' ');
    await createPlayer(db, {
      teamId, firstName, lastName,
      position: person.position as Position, number: person.number,
    });
  }
  return { teamId, gameId, roster: await rosterForGame(db, gameId) };
}

/** The state a play actually started from, per nflverse. */
function realCursor(play: Play): GameCursor | null {
  if (play.yardline_100 === null) return null;
  return {
    quarter: play.qtr,
    down: play.down,
    distance: play.ydstogo,
    ballPosition: toAbsolute(play.yardline_100, play.posteam),
    situation: 'normal',
    possession: possessionOf(play.posteam),
  };
}

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
});
