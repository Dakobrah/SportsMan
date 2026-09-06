/**
 * Recording a play.
 *
 * Django POSTed each play and read `next_state` back off the response
 * (static/js/tracker.js:141-204). With the database on the device that whole
 * round trip collapses into one function, and — more importantly — the snap
 * insert, the score update and the cursor write become a single transaction.
 * Django could not do that: `RunPlay.objects.create` and
 * `game.save(update_fields=['team_score'])` were separate uncoordinated
 * writes, so a failure between them left a play recorded with the score
 * unchanged.
 */
import type { Database } from '../db/driver';
import { addScore, getGameContext, readGameCursor, readScores, writeGameCursor } from '../db/repositories/games';
import { rosterForGame } from '../db/repositories/players';
import {
  addAssist, deleteSnap, getSnap, insertSnap, lastSnap, listSnaps, type NewSnap,
} from '../db/repositories/snaps';
import type { Game, Player, Season, Snap, Team } from '../db/repositories/types';
import { AppError } from '../errors';
import { extraPointSpotFor, kickoffSpotFor } from './field';
import { type GameCursor, advance, cursorAfter, playTypeOf, rebuildCursor,
         snapToGameState, snapToPlayData, snapToPlayResult } from './cursor';
import type { NextState } from './nextState';
import { computeNextState } from './nextState';
import {
  emptyDefaults,
  playerByNumber,
  rememberPlayers,
  type DefaultsByTeam,
  type PlayForm,
} from './playForm';
import { pointsFor, pointsForSnap } from './score';
import { playerLookup, snapYardage, summarize } from './summary';
import { validateCursor, validateForm, validateJerseys } from './validate';

/** How many plays the live feed keeps on screen (tracker.js). */
export const FEED_LIMIT = 15;

export interface FeedEntry {
  id: number;
  sequenceNumber: number;
  quarter: number;
  summary: string;
  yards: number;
  isTouchdown: boolean;
  isInterception: boolean;
}

export interface RecordPlayOutcome {
  snapId: number;
  sequenceNumber: number;
  next: NextState;
  cursor: GameCursor;
  /** Both sides, because either can score. */
  teamScore: number;
  opponentScore: number;
  entry: FeedEntry;
}

export interface UndoOutcome {
  removed: Snap;
  cursor: GameCursor;
  teamScore: number;
  opponentScore: number;
}

export interface TrackerSnapshot {
  game: Game;
  season: Season;
  team: Team;
  roster: Player[];
  cursor: GameCursor;
  feed: FeedEntry[];
  /** Who last filled each role, per side. */
  defaults: DefaultsByTeam;
}

/**
 * Rebuild the per-side player defaults from the plays already recorded.
 *
 * Read from the database rather than held in memory so they survive a
 * reload, like everything else the tracker shows. Folded oldest-first, so
 * the most recent non-null value for each role wins.
 */
export async function recentPlayers(
  db: Database,
  gameId: number,
): Promise<DefaultsByTeam> {
  const rows = await db.all<{
    possession: 'us' | 'them';
    quarterback_number: number | null;
    receiver_number: number | null;
    kicker_number: number | null;
    punter_number: number | null;
  }>(
    `SELECT possession, quarterback_number, receiver_number,
            kicker_number, punter_number
     FROM snaps WHERE game_id = ? ORDER BY sequence_number ASC`,
    [gameId],
  );

  const out = emptyDefaults();
  for (const row of rows) {
    const side = out[row.possession] ?? out.us;
    if (row.quarterback_number !== null) side.quarterbackNumber = row.quarterback_number;
    if (row.receiver_number !== null) side.receiverNumber = row.receiver_number;
    if (row.kicker_number !== null) side.kickerNumber = row.kicker_number;
    if (row.punter_number !== null) side.punterNumber = row.punter_number;
  }
  return out;
}

/**
 * Map a filled-in form onto a flat `snaps` row.
 *
 * Kickoffs and extra points override the ball position with the named spot
 * for whichever side is kicking. Django wrote the literals 35 and 3 here
 * (tracker.py:705, :886) which, under the -50..+50 convention, mean the
 * opponent's 15 and our own 47 — neither of which is where those plays
 * happen, and neither of which accounted for the opponent kicking.
 */
export function toSnapRow(form: PlayForm, cursor: GameCursor, roster: Player[] = []): NewSnap {
  /**
   * A jersey number becomes a player link only when we have the ball. Their
   * #22 is a different person from ours, so resolving an opponent's number
   * against our roster would attribute their carries to our running back.
   */
  const link = (number: number | null): number | null =>
    cursor.possession === 'us' ? (playerByNumber(number, roster)?.id ?? null) : null;

  /**
   * A defender is one of OURS even when the opponent has the ball, so unlike
   * `link` this resolves against our roster whatever the possession is.
   */
  const linkOurs = (number: number | null): number | null =>
    playerByNumber(number, roster)?.id ?? null;

  const defense = (form: { tacklerNumber: number | null; tackleForLoss: boolean;
                           appliedPressure: boolean; forcedIncompletion: boolean;
                           isDefensiveTouchdown: boolean }) => ({
    primaryPlayerNumber: form.tacklerNumber,
    primaryPlayerId: linkOurs(form.tacklerNumber),
    tackleForLoss: form.tackleForLoss,
    appliedPressure: form.appliedPressure,
    forcedIncompletion: form.forcedIncompletion,
    isDefensiveTouchdown: form.isDefensiveTouchdown,
  });

  const header = {
    quarter: cursor.quarter,
    down: cursor.down,
    distance: cursor.distance,
    ballPosition: cursor.ballPosition,
    // Stored so cursorAfter can replay the play in the right direction.
    possession: cursor.possession,
    notes: form.notes,
  };

  switch (form.type) {
    case 'run':
      return {
        ...header, kind: 'RUN', ...defense(form),
        ballCarrierNumber: form.ballCarrierNumber,
        ballCarrierId: link(form.ballCarrierNumber),
        yardsGained: form.yardsGained,
        isTouchdown: form.isTouchdown,
        isFirstDown: form.isFirstDown,
        fumbled: form.fumbled,
        fumbleLost: form.fumbleLost,
      };

    case 'pass':
      return {
        ...header, kind: 'PASS', ...defense(form),
        quarterbackNumber: form.quarterbackNumber,
        quarterbackId: link(form.quarterbackNumber),
        receiverNumber: form.receiverNumber,
        receiverId: link(form.receiverNumber),
        // Django set target and receiver to the same player (tracker.py:523).
        targetId: link(form.receiverNumber),
        isComplete: form.isComplete,
        // A sack's loss lives in sackYards, so the gain is zero.
        yardsGained: form.wasSacked ? 0 : form.yardsGained,
        sackYards: form.wasSacked ? -Math.abs(form.yardsGained) : 0,
        wasSacked: form.wasSacked,
        isTouchdown: form.isTouchdown,
        isFirstDown: form.isFirstDown,
        isInterception: form.isInterception,
        fumbled: form.fumbled,
        fumbleLost: form.fumbleLost,
      };

    case 'penalty':
      return {
        ...header, kind: 'PENALTY',
        hadPenalty: true,
        penaltyDescription: form.penaltyName,
        // A declined penalty moves the ball nowhere (tracker.py:631).
        penaltyYards: form.accepted ? form.penaltyYards : 0,
        penaltyOnOffense: form.onOffense,
        penaltyAccepted: form.accepted,
      };

    case 'kickoff':
      return {
        ...header, kind: 'KICKOFF',
        down: null, distance: null, ballPosition: kickoffSpotFor(cursor.possession),
        kickerNumber: form.kickerNumber,
        kickerId: link(form.kickerNumber),
        kickYards: form.kickYards,
        isTouchback: form.isTouchback,
        isOnsideKick: form.isOnsideKick,
        outOfBounds: form.outOfBounds,
        // The returner belongs to the RECEIVING team, which is the side we
        // do not have possession of on a kick -- so `link` is inverted here.
        returnerNumber: form.returnerNumber,
        returnerId: cursor.possession === 'us' ? null : linkOurs(form.returnerNumber),
        returnYards: form.returnYards,
        fumbled: form.fumbled,
        fumbleLost: form.fumbleLost,
      };

    case 'punt':
      return {
        ...header, kind: 'PUNT',
        punterNumber: form.punterNumber,
        punterId: link(form.punterNumber),
        puntYards: form.puntYards,
        isTouchback: form.isTouchback,
        isBlocked: form.isBlocked,
        outOfBounds: form.outOfBounds,
        returnerNumber: form.returnerNumber,
        returnerId: cursor.possession === 'us' ? null : linkOurs(form.returnerNumber),
        returnYards: form.returnYards,
        isFairCatch: form.isFairCatch,
        fumbled: form.fumbled,
        fumbleLost: form.fumbleLost,
      };

    case 'field_goal':
      return {
        ...header, kind: 'FG',
        kickerNumber: form.kickerNumber,
        kickerId: link(form.kickerNumber),
        kickDistance: form.kickDistance,
        result: form.result,
      };

    case 'extra_point':
      return {
        ...header, kind: 'XP',
        down: null, distance: null, ballPosition: extraPointSpotFor(cursor.possession),
        attemptType: form.attemptType,
        result: form.result,
        kickerNumber: form.kickerNumber,
        kickerId: link(form.kickerNumber),
      };
  }
}

const toFeedEntry = (snap: Snap, players: ReadonlyMap<number, Player>): FeedEntry => ({
  id: snap.id,
  sequenceNumber: snap.sequenceNumber,
  quarter: snap.quarter,
  summary: summarize(snap, players),
  yards: snapYardage(snap),
  isTouchdown: snap.isTouchdown,
  isInterception: snap.isInterception,
});

/**
 * Validate, write, score and advance — all inside one transaction, so a
 * failure cannot leave a play recorded with the score or cursor stale.
 */
export async function recordPlay(
  db: Database,
  gameId: number,
  cursor: GameCursor,
  form: PlayForm,
  roster: Player[],
): Promise<RecordPlayOutcome> {
  // Throws before anything is written, carrying the field to highlight.
  validateCursor(cursor);
  validateForm(form);
  validateJerseys(form);

  return db.transaction(async () => {
    const { id, sequenceNumber } = await insertSnap(db, gameId, toSnapRow(form, cursor, roster));

    // Assists are their own rows. Same transaction, so a play never lands
    // with half its tacklers.
    if (form.type === 'run' || form.type === 'pass') {
      const assistType = form.type === 'pass' && form.wasSacked ? 'SACK' : 'TACKLE';
      for (const number of form.assistNumbers) {
        const player = playerByNumber(number, roster);
        if (player) await addAssist(db, id, player.id, assistType);
      }
    }

    // Points go to whoever had the ball. Applying them to us regardless is
    // how a 36-33 game replayed as 69-0.
    const points = pointsFor(form);
    const scores = points
      ? await addScore(db, gameId, points, cursor.possession)
      : await readScores(db, gameId);

    // Read the stored row back and advance from that, rather than from the
    // form. The cursor a reload rebuilds is then the same one returned here
    // by construction, which is the whole point of tests/game/durability.
    const snap = await getSnap(db, id);
    if (!snap) throw new AppError('The play could not be read back.', 'insert_failed');

    const next = computeNextState(
      snapToGameState(snap),
      playTypeOf(snap.kind),
      snapToPlayData(snap),
      snapToPlayResult(snap),
    );
    const advanced = advance(cursor, next);
    await writeGameCursor(db, gameId, advanced);

    return {
      snapId: id,
      sequenceNumber,
      next,
      cursor: advanced,
      teamScore: scores.teamScore,
      opponentScore: scores.opponentScore,
      entry: toFeedEntry(snap, playerLookup(roster)),
    };
  });
}

/**
 * Remove the last play and put the game back where it was.
 *
 * Django echoed the new last snap's own down/distance/ball_position
 * (tracker.py:1038-1043), which rewound one play too many and hardcoded
 * `situation: 'normal'` — breaking the chain when the new last play was a
 * touchdown. Rebuilding from the play itself gets both right.
 */
export async function undoLastPlay(db: Database, gameId: number): Promise<UndoOutcome> {
  return db.transaction(async () => {
    const snap = await lastSnap(db, gameId);
    if (!snap) throw new AppError('There is no play to undo.', 'nothing_to_undo');

    // Take the points off the side that scored them, which the snap records.
    const points = pointsForSnap(snap);
    await deleteSnap(db, snap.id);
    const scores = points
      ? await addScore(db, gameId, -points, snap.possession)
      : await readScores(db, gameId);

    const cursor = await rebuildCursor(db, gameId);
    await writeGameCursor(db, gameId, cursor);

    return {
      removed: snap,
      cursor,
      teamScore: scores.teamScore,
      opponentScore: scores.opponentScore,
    };
  });
}

/** Everything the tracker screen needs to paint itself. */
export async function loadTracker(
  db: Database,
  gameId: number,
): Promise<TrackerSnapshot> {
  const context = await getGameContext(db, gameId);
  if (!context) throw new AppError('That game does not exist.', 'game_not_found');

  const roster = await rosterForGame(db, gameId);
  // The stored cursor is authoritative; rebuilding is the repair path for a
  // database that predates it or came in through an import.
  const cursor = (await readGameCursor(db, gameId)) ?? (await rebuildCursor(db, gameId));
  const recent = await listSnaps(db, gameId, { order: 'desc', limit: FEED_LIMIT });
  const defaults = await recentPlayers(db, gameId);
  const players = playerLookup(roster);

  return {
    ...context,
    roster,
    cursor,
    defaults,
    feed: recent.map((snap) => toFeedEntry(snap, players)),
  };
}

export { cursorAfter, rememberPlayers };
