/**
 * One game, in full.
 *
 * Reads only through the report layer, which is validated against a real
 * NFL game, so what this shows has already been checked against reality.
 */
import type { Database } from '../../db/driver';
import { getGameContext } from '../../db/repositories/games';
import { rosterForGame } from '../../db/repositories/players';
import { downEfficiency, fieldZones, teamTotals, tendencies, yardageBuckets } from '../../db/reports/team';
import { defenseTotals } from '../../db/reports/defense';
import { penaltyTotals } from '../../db/reports/penalties';
import { passingByPlayer, receivingByPlayer, rushingByPlayer } from '../../db/reports/players';
import { extraPointTotals, fieldGoalTotals, puntTotals } from '../../db/reports/specialTeams';
import { reportSnaps } from '../../db/reports/snaps';
import { fieldGoalBluf, passingBluf, puntBluf, rushingBluf } from '../../game/bluf';
import { playerLookup, summarize } from '../../game/summary';
import { conversions, deriveOffense, percent, turnoverMargin } from '../metrics';
import { redZone, segmentDrives } from '../drives';
import { Ruleset } from '../../game/engine/Ruleset';
import { pointsByQuarter } from '../scoring';
import {
  fixed, section, signed, stat, table,
  type Block, type ReportModel, type Scope,
} from '../model';

export async function buildPostGame(db: Database, scope: Scope): Promise<ReportModel> {
  if (scope.kind !== 'game') throw new Error('post-game needs a game');
  const gameIds = [scope.gameId];

  const context = await getGameContext(db, scope.gameId);
  if (!context) throw new Error('That game does not exist.');
  const { game, season, team } = context;
  const us = team.abbreviation;
  const them = game.opponent;

  const [ours, theirs, snaps, roster, defense, penalties] = await Promise.all([
    teamTotals(db, { gameIds, possession: 'us' }),
    teamTotals(db, { gameIds, possession: 'them' }),
    reportSnaps(db, { gameIds }),
    rosterForGame(db, scope.gameId),
    defenseTotals(db, { gameIds }),
    penaltyTotals(db, { gameIds, possession: 'us' }),
  ]);

  const offense = deriveOffense(ours);
  const allowed = deriveOffense(theirs);
  const margin = turnoverMargin(ours, theirs);
  const drives = segmentDrives(snaps, Ruleset.for(season.ruleset));
  const ourDrives = drives.filter((d) => d.possession === 'us');
  const zone = redZone(ourDrives);
  const players = playerLookup(roster);

  const result = game.teamScore > game.opponentScore
    ? 'Won' : game.teamScore < game.opponentScore ? 'Lost' : 'Tied';

  // --- Sections ------------------------------------------------------------

  const scoring = section('scoring', 'Scoring', [
    {
      type: 'chart',
      title: 'Scoring by quarter',
      chart: { chart: 'scoringByQuarter', data: pointsByQuarter(snaps), us, them },
      body: table(
        [{ key: 'quarter', label: 'Quarter' },
         { key: 'us', label: us, align: 'right' },
         { key: 'them', label: them, align: 'right' }],
        pointsByQuarter(snaps).map((q) => ({ quarter: `Q${q.quarter}`, us: q.us, them: q.them })),
      ),
    },
  ]);

  const offenceSection = section('offense', 'Our offense', [
    { type: 'bluf', title: 'In short', lines: [
      rushingBluf({ attempts: ours.rushAttempts, yards: ours.rushYards, touchdowns: ours.rushTouchdowns }),
      passingBluf({ attempts: ours.passAttempts, yards: ours.passYards,
                    touchdowns: ours.passTouchdowns, interceptions: ours.interceptions }),
    ] },
    { type: 'stats', stats: [
      stat('Total yards', offense.totalYards),
      stat('Yards per play', fixed(offense.yardsPerPlay)),
      stat('Rushing', `${ours.rushYards} on ${ours.rushAttempts}`, { hint: `${fixed(offense.yardsPerCarry)} per carry` }),
      stat('Passing', `${ours.completions}/${ours.passAttempts} for ${ours.passYards}`,
           { hint: `rating ${fixed(offense.passerRating)}` }),
      stat('Sacks taken', `${ours.sacks} for ${Math.abs(ours.sackYards)}`),
      stat('Turnovers', offense.turnovers, { tone: offense.turnovers > 1 ? 'bad' : 'neutral' }),
    ] },
    {
      type: 'chart',
      title: 'Gains by yardage',
      chart: { chart: 'yardageDistribution', data: await yardageBuckets(db, { gameIds, possession: 'us' }) },
      body: table(
        [{ key: 'bucket', label: 'Yards' },
         { key: 'runs', label: 'Runs', align: 'right' },
         { key: 'passes', label: 'Passes', align: 'right' }],
        (await yardageBuckets(db, { gameIds, possession: 'us' }))
          .map((b) => ({ bucket: b.bucket, runs: b.runs, passes: b.passes })),
      ),
    },
  ]);

  const defenceSection = section('defense', 'Our defense', [
    { type: 'text', body:
      'There is no separate defensive play form: these are what their offense '
      + 'did against us, so their yards are yards allowed and their turnovers '
      + 'are our takeaways.' },
    { type: 'stats', stats: [
      stat('Yards allowed', allowed.totalYards),
      stat('Per play', fixed(allowed.yardsPerPlay)),
      stat('Rushing allowed', `${theirs.rushYards} on ${theirs.rushAttempts}`),
      stat('Passing allowed', `${theirs.completions}/${theirs.passAttempts} for ${theirs.passYards}`),
      stat('Sacks by us', theirs.sacks),
      stat('Takeaways', margin.takeaways, { tone: margin.takeaways > 0 ? 'good' : 'neutral' }),
      stat('Turnover margin', signed(margin.margin),
           { tone: margin.margin > 0 ? 'good' : margin.margin < 0 ? 'bad' : 'neutral' }),
      stat('Tackles credited', defense.tackles,
           { hint: defense.unattributed > 0 ? `${defense.unattributed} plays with no tackler entered` : undefined }),
    ] },
  ]);

  const ourDowns = conversions(await downEfficiency(db, { gameIds, possession: 'us' }));
  const theirDowns = conversions(await downEfficiency(db, { gameIds, possession: 'them' }));
  const situational = section('situational', 'Situational', [
    {
      type: 'chart',
      title: 'Conversion rate by down',
      caption: `The tick behind each bar is ${them}.`,
      chart: { chart: 'downEfficiency', data: ourDowns, comparison: theirDowns, comparisonLabel: them },
      body: table(
        [{ key: 'down', label: 'Down' },
         { key: 'ours', label: us, align: 'right' },
         { key: 'theirs', label: them, align: 'right' }],
        ourDowns.map((d) => ({
          down: d.down,
          ours: `${d.converted}/${d.attempts}`,
          theirs: (() => {
            const other = theirDowns.find((t) => t.down === d.down);
            return other ? `${other.converted}/${other.attempts}` : '—';
          })(),
        })),
      ),
    },
    { type: 'stats', title: 'Red zone', stats: [
      stat('Trips', zone.trips),
      stat('Touchdowns', zone.touchdowns),
      stat('Scored on', `${fixed(zone.scorePct, 0)}%`),
    ] },
    {
      type: 'chart',
      title: 'Plays by field zone',
      chart: { chart: 'fieldZones', data: await fieldZones(db, { gameIds, possession: 'us' }) },
      body: table(
        [{ key: 'zone', label: 'Zone' },
         { key: 'plays', label: 'Plays', align: 'right' },
         { key: 'yards', label: 'Yards', align: 'right' }],
        (await fieldZones(db, { gameIds, possession: 'us' }))
          .map((z) => ({ zone: z.zone, plays: z.plays, yards: z.yards })),
      ),
    },
  ]);

  const driveSection = section('drives', 'Drives', [
    {
      type: 'chart',
      title: 'Drive by drive',
      chart: { chart: 'driveChart', drives, us, them },
      body: table(
        [{ key: 'n', label: '#' }, { key: 'team', label: 'Team' },
         { key: 'quarter', label: 'Q', align: 'right' },
         { key: 'plays', label: 'Plays', align: 'right' },
         { key: 'yards', label: 'Yards', align: 'right' },
         { key: 'result', label: 'Result' }],
        drives.map((d) => ({
          n: d.index, team: d.possession === 'us' ? us : them,
          quarter: d.quarter, plays: d.plays, yards: d.yards, result: d.outcome,
        })),
      ),
    },
  ]);

  const [fg, punts, xp] = await Promise.all([
    fieldGoalTotals(db, { gameIds, possession: 'us' }),
    puntTotals(db, { gameIds, possession: 'us' }),
    extraPointTotals(db, { gameIds, possession: 'us' }),
  ]);
  const specialTeams = fg.attempts + punts.punts + xp.patAttempts + xp.twoPointAttempts === 0
    ? null
    : section('special-teams', 'Special teams', [
        { type: 'bluf', title: 'In short', lines: [
          fieldGoalBluf({ attempts: fg.attempts, made: fg.made, longest: fg.longest,
                          percentage: percent(fg.made, fg.attempts) }),
          puntBluf({ punts: punts.punts, avgYards: punts.punts === 0 ? 0 : punts.yards / punts.punts,
                     longest: punts.longest ?? 0 }),
        ] },
        { type: 'stats', stats: [
          stat('Field goals', `${fg.made}/${fg.attempts}`),
          stat('Extra points', `${xp.patMade}/${xp.patAttempts}`),
          stat('Two-point', `${xp.twoPointMade}/${xp.twoPointAttempts}`),
          stat('Punts', punts.punts, { hint: punts.punts ? `${fixed(punts.yards / punts.punts)} average` : undefined }),
        ] },
      ]);

  const [rushers, passers, receivers] = await Promise.all([
    rushingByPlayer(db, { gameIds }),
    passingByPlayer(db, { gameIds }),
    receivingByPlayer(db, { gameIds }),
  ]);
  const leaders = section('leaders', 'Leaders', [
    rushers.length ? {
      type: 'table', title: 'Rushing',
      body: table(
        [{ key: 'player', label: 'Player' }, { key: 'att', label: 'Att', align: 'right' },
         { key: 'yards', label: 'Yards', align: 'right' }, { key: 'td', label: 'TD', align: 'right' },
         { key: 'long', label: 'Long', align: 'right' }],
        rushers.map((r) => ({
          player: `#${r.number} ${r.lastName}`, att: r.attempts,
          yards: r.yards, td: r.touchdowns, long: r.longest ?? 0,
        })),
      ),
    } as Block : null,
    passers.length ? {
      type: 'table', title: 'Passing',
      body: table(
        [{ key: 'player', label: 'Player' }, { key: 'line', label: 'C/A' },
         { key: 'yards', label: 'Yards', align: 'right' }, { key: 'td', label: 'TD', align: 'right' },
         { key: 'int', label: 'INT', align: 'right' }, { key: 'rating', label: 'Rating', align: 'right' }],
        passers.map((p) => ({
          player: `#${p.number} ${p.lastName}`, line: `${p.completions}/${p.attempts}`,
          yards: p.yards, td: p.touchdowns, int: p.interceptions,
          rating: fixed(deriveOffense({
            ...ours, passAttempts: p.attempts, completions: p.completions,
            passYards: p.yards, passTouchdowns: p.touchdowns, interceptions: p.interceptions,
          }).passerRating),
        })),
      ),
    } as Block : null,
    receivers.length ? {
      type: 'table', title: 'Receiving',
      body: table(
        [{ key: 'player', label: 'Player' }, { key: 'rec', label: 'Rec', align: 'right' },
         { key: 'targets', label: 'Tgt', align: 'right' },
         { key: 'yards', label: 'Yards', align: 'right' }, { key: 'td', label: 'TD', align: 'right' }],
        receivers.map((r) => ({
          player: `#${r.number} ${r.lastName}`, rec: r.receptions,
          targets: r.targets, yards: r.yards, td: r.touchdowns,
        })),
      ),
    } as Block : null,
  ]);

  const keyPlays = snaps.filter(
    (s) => s.isTouchdown || s.isInterception || s.fumbleLost
      || (s.kind === 'FG' && s.result === 'GOOD'),
  );
  const moments = keyPlays.length === 0 ? null : section('key-plays', 'Key plays', [
    {
      type: 'table', title: 'Scores and turnovers',
      body: table(
        [{ key: 'seq', label: '#' }, { key: 'quarter', label: 'Q' },
         { key: 'team', label: 'Team' }, { key: 'play', label: 'Play' }],
        keyPlays.map((s) => ({
          seq: s.sequenceNumber, quarter: `Q${s.quarter}`,
          team: s.possession === 'us' ? us : them, play: summarize(s, players),
        })),
      ),
    },
  ]);

  const tendency = await tendencies(db, { gameIds, possession: 'us' });
  const calls = tendency.length === 0 ? null : section('tendencies', 'Formations', [
    {
      type: 'table', title: 'What we ran, and from where',
      body: table(
        [{ key: 'formation', label: 'Formation' },
         { key: 'plays', label: 'Plays', align: 'right' },
         { key: 'split', label: 'Run/Pass' },
         { key: 'yards', label: 'Yards', align: 'right' }],
        tendency.map((t) => ({
          formation: t.formation, plays: t.plays,
          split: `${t.runs}/${t.passes}`, yards: t.yards,
        })),
      ),
    },
  ]);

  return {
    templateId: 'post-game',
    title: `${us} vs ${them}`,
    subtitle: `${game.date} · ${game.location}`,
    generatedAt: new Date().toISOString(),
    headline: stat(result, `${game.teamScore}–${game.opponentScore}`),
    sections: [
      scoring, offenceSection, defenceSection, situational, driveSection,
      ...(specialTeams ? [specialTeams] : []),
      leaders,
      ...(calls ? [calls] : []),
      ...(moments ? [moments] : []),
      ...(penalties.penalties > 0
        ? [section('penalties', 'Penalties', [
            { type: 'stats', stats: [
              stat('Penalties', penalties.penalties),
              stat('Yards', penalties.yards),
              stat('Declined', penalties.declined),
            ] },
          ])]
        : []),
    ],
  };
}
