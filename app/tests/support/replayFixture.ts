/**
 * The real-game fixture, and the machinery to replay it.
 *
 * `replay.game.json` is a real 2024 NFL game (PHI at WAS, 33-36) taken from
 * public nflverse play-by-play, with every player name replaced by a
 * synthetic one and a jersey number. The football is real: the downs,
 * yardage, turnovers and scores all happened.
 *
 * Extracted from tests/game/replay.test.ts so the report tests can be
 * validated against the same real game rather than against invented
 * fixtures.
 *
 * WHAT THIS FIXTURE CANNOT VALIDATE. `toForm` below hardcodes punt yards to
 * 40 (nflverse stores return yards in that column), synthesises field goal
 * distance as `yardline_100 + 17`, hardcodes kickoff yards to 60, and labels
 * every penalty 'Holding (Offense)'. So field goals made and attempted are
 * real but DISTANCE is not; penalty count and yardage are real but the
 * BREAKDOWN BY NAME is not; punting and kickoff numbers are artefacts.
 * Rushing, passing, scoring, turnovers and drives are real and can be
 * asserted against reality.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { Database } from '../../src/lib/db/driver';
import { createTeam } from '../../src/lib/db/repositories/teams';
import { createSeason } from '../../src/lib/db/repositories/seasons';
import { createPlayer, rosterForGame } from '../../src/lib/db/repositories/players';
import { createGame } from '../../src/lib/db/repositories/games';
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

export interface Replayed {
  teamId: number;
  gameId: number;
  roster: Player[];
  /** Plays the tracker could record. The rest are nflverse admin rows. */
  recorded: number;
}

/**
 * Seed the fixture's team and replay every play through the production
 * write path, so every column a report reads is populated exactly as the
 * app would populate it.
 */
export async function replayGame(db: Database): Promise<Replayed> {
  const seeded = await seedFromFixture(db);
  let recorded = 0;
  for (const play of fixture.plays) {
    const cursor = realCursor(play);
    const form = toForm(play);
    if (!cursor || !form) continue;
    await recordPlay(db, seeded.gameId, cursor, form, seeded.roster as Player[]);
    recorded += 1;
  }
  return { ...seeded, recorded };
}

export { fixture, US, THEM, toAbsolute, possessionOf, toForm, seedFromFixture, realCursor };
export type { Play, Fixture };
