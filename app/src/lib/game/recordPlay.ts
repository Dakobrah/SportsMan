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
import { listPlays } from '../db/repositories/plays';
import {
  addAssist, deleteSnap, getSnap, insertSnap, lastSnap, listSnaps, type NewSnap,
} from '../db/repositories/snaps';
import type { Game, Play, Player, Season, Snap, Team } from '../db/repositories/types';
import { AppError } from '../errors';
import { type Possession, otherTeam } from './field';
import { type GameCursor, advance, rebuildCursor, stateAfter } from './cursor';
import { GameState, type NextState } from './engine/GameState';
import { plays } from './engine/PlayRegistry';
import {
  emptyDefaults,
  playerByNumber,
  type DefaultsByTeam,
  type PlayForm,
} from './playForm';
import { pointsForSnap } from './score';
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
  /** The whole playbook, loaded once so a form need not query per play. */
  playbook: Play[];
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
 * Each play writes its own columns. Kickoffs and tries also override the
 * spot with the named one for whichever side is kicking: Django wrote the
 * literals 35 and 3 here (tracker.py:705, :886) which, under the -50..+50
 * convention, mean the opponent's 15 and our own 47 -- neither of which is
 * where those plays happen.
 */
export function toSnapRow(form: PlayForm, cursor: GameCursor, roster: Player[] = []): NewSnap {
  return plays.forForm(form).toRow(form, GameState.from(cursor), roster);
}

/**
 * The scores the yardage has already told us about.
 *
 * `isTouchdown` began as a toggle the coach pressed, which quietly made six
 * points optional: a five-yard run from the five was stored as an ordinary
 * gain, scored nothing, and left the next snap first and goal on the goal
 * line. A safety is the same in reverse. Neither is a judgement call, so
 * each play derives its own before the row is written; see
 * `PlayDefinition.derive`.
 */
export function withGoalLineTouchdown(form: PlayForm, cursor: GameCursor): PlayForm {
  return plays.forForm(form).derive(form, GameState.from(cursor));
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

  // Derived before the transaction, so the row, the points and the cursor
  // are all computed from one reading of the play rather than three.
  const state = GameState.from(cursor);
  const play = plays.forForm(form);
  const played = play.derive(form, state);

  return db.transaction(async () => {
    const { id, sequenceNumber } = await insertSnap(db, gameId, play.toRow(played, state, roster));

    // Assists are their own rows. Same transaction, so a play never lands
    // with half its tacklers.
    if (played.type === 'run' || played.type === 'pass') {
      const assistType = played.type === 'pass' && played.wasSacked ? 'SACK' : 'TACKLE';
      for (const number of played.assistNumbers) {
        const player = playerByNumber(number, roster);
        if (player) await addAssist(db, id, player.id, assistType);
      }
    }

    // The play decides who its points belong to; see PlayDefinition.scorer.
    const points = play.pointsFor(played);
    const scores = points
      ? await addScore(db, gameId, points, play.scorer(play.scoringFacts(played), cursor.possession))
      : await readScores(db, gameId);

    // Read the stored row back and advance from that, rather than from the
    // form. The cursor a reload rebuilds is then the same one returned here
    // by construction, which is the whole point of tests/game/durability.
    const snap = await getSnap(db, id);
    if (!snap) throw new AppError('The play could not be read back.', 'insert_failed');

    const next = stateAfter(snap).toNextState();
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
 * Who received the opening kickoff, read off the first play of the game.
 *
 * If that was a kickoff, the other side received it. If it was anything
 * else, the coach started tracking after the kick, and whoever had the ball
 * first is who received. With nothing recorded, the tracker opens with our
 * ball -- see `GameState.opening`.
 */
async function openingReceiver(db: Database, gameId: number): Promise<Possession> {
  const [first] = await listSnaps(db, gameId, { order: 'asc', limit: 1 });
  if (!first) return GameState.opening().possession;
  return first.kind === 'KICKOFF' ? otherTeam(first.possession) : first.possession;
}

/**
 * Move the game to `quarter`, and apply what the new period means for play.
 *
 * Only halftime changes anything: the team that received the opening kick
 * kicks off the second half. Persisted at once -- Django kept the quarter
 * client-side, so a reload before the next play lost it.
 */
export async function changeQuarter(
  db: Database,
  gameId: number,
  cursor: GameCursor,
  quarter: number,
): Promise<GameCursor> {
  const next = GameState.from(cursor).toQuarter(quarter, await openingReceiver(db, gameId)).toCursor();
  await writeGameCursor(db, gameId, next);
  return next;
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
      ? await addScore(db, gameId, -points, plays.forKind(snap.kind).scorer(snap, snap.possession))
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
  const playbook = await listPlays(db);
  const defaults = await recentPlayers(db, gameId);
  const players = playerLookup(roster);

  return {
    ...context,
    roster,
    playbook,
    cursor,
    defaults,
    feed: recent.map((snap) => toFeedEntry(snap, players)),
  };
}
