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
  isSafety: boolean;
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

const toFeedEntry = (snap: Snap, players: ReadonlyMap<number, Player>): FeedEntry => ({
  id: snap.id,
  sequenceNumber: snap.sequenceNumber,
  quarter: snap.quarter,
  summary: summarize(snap, players),
  yards: snapYardage(snap),
  isTouchdown: snap.isTouchdown,
  isInterception: snap.isInterception,
  isSafety: snap.isSafety,
});

/**
 * One game's tracker: recording plays, undoing them, and moving the clock.
 *
 * Every operation here used to be a free function taking the same
 * `(db, gameId)` pair; the class holds them once. It is stateless beyond
 * that -- the database is the truth, and each method reads what it needs --
 * so a new instance is as good as a kept one.
 */
export class GameTracker {
  constructor(
    private readonly db: Database,
    readonly gameId: number,
  ) {}

  /**
   * Everything the tracker screen needs to paint itself.
   *
   * The reads are independent, so they are issued together: on Tauri each
   * is a round trip to the Rust side, and awaiting them one at a time spent
   * five of those waiting on nothing.
   */
  async load(): Promise<TrackerSnapshot> {
    const [context, roster, stored, recent, playbook, defaults] = await Promise.all([
      getGameContext(this.db, this.gameId),
      rosterForGame(this.db, this.gameId),
      readGameCursor(this.db, this.gameId),
      listSnaps(this.db, this.gameId, { order: 'desc', limit: FEED_LIMIT }),
      listPlays(this.db),
      this.recentPlayers(),
    ]);
    if (!context) throw new AppError('That game does not exist.', 'game_not_found');

    // The stored cursor is authoritative; rebuilding is the repair path for a
    // database that predates it or came in through an import.
    const cursor = stored ?? (await rebuildCursor(this.db, this.gameId));
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

  /**
   * Validate, write, score and advance -- all inside one transaction, so a
   * failure cannot leave a play recorded with the score or cursor stale.
   */
  async record(cursor: GameCursor, form: PlayForm, roster: Player[]): Promise<RecordPlayOutcome> {
    // Throws before anything is written, carrying the field to highlight.
    validateCursor(cursor);
    validateForm(form);
    validateJerseys(form);

    // Derived before the transaction, so the row, the points and the cursor
    // are all computed from one reading of the play rather than three.
    const state = GameState.from(cursor);
    const play = plays.forForm(form);
    const played = play.derive(form, state);
    const facts = play.scoringFacts(played);

    return this.db.transaction(async () => {
      const { id, sequenceNumber } = await insertSnap(this.db, this.gameId, play.toRow(played, state, roster));

      // Assists are their own rows. Same transaction, so a play never lands
      // with half its tacklers.
      if (played.type === 'run' || played.type === 'pass') {
        const assistType = played.type === 'pass' && played.wasSacked ? 'SACK' : 'TACKLE';
        for (const number of played.assistNumbers) {
          const player = playerByNumber(number, roster);
          if (player) await addAssist(this.db, id, player.id, assistType);
        }
      }

      // The play decides who its points belong to; see PlayDefinition.scorer.
      const points = play.points(facts);
      const scores = points
        ? await addScore(this.db, this.gameId, points, play.scorer(facts, state.possession))
        : await readScores(this.db, this.gameId);

      // Read the stored row back and advance from that, rather than from the
      // form. The cursor a reload rebuilds is then the same one returned here
      // by construction, which is the whole point of tests/game/durability.
      const snap = await getSnap(this.db, id);
      if (!snap) throw new AppError('The play could not be read back.', 'insert_failed');

      const next = stateAfter(snap).toNextState();
      const advanced = advance(cursor, next);
      await writeGameCursor(this.db, this.gameId, advanced);

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
   * `situation: 'normal'` -- breaking the chain when the new last play was a
   * touchdown. Rebuilding from the play itself gets both right.
   */
  async undo(): Promise<UndoOutcome> {
    return this.db.transaction(async () => {
      const snap = await lastSnap(this.db, this.gameId);
      if (!snap) throw new AppError('There is no play to undo.', 'nothing_to_undo');

      // Take the points off the side that scored them, which the snap records.
      const points = pointsForSnap(snap);
      await deleteSnap(this.db, snap.id);
      const scores = points
        ? await addScore(this.db, this.gameId, -points, plays.forKind(snap.kind).scorer(snap, snap.possession))
        : await readScores(this.db, this.gameId);

      const cursor = await rebuildCursor(this.db, this.gameId);
      await writeGameCursor(this.db, this.gameId, cursor);

      return {
        removed: snap,
        cursor,
        teamScore: scores.teamScore,
        opponentScore: scores.opponentScore,
      };
    });
  }

  /**
   * Move the game to `quarter`, and apply what the new period means for play.
   *
   * Only halftime changes anything: the team that received the opening kick
   * kicks off the second half. Persisted at once -- Django kept the quarter
   * client-side, so a reload before the next play lost it.
   */
  async changeQuarter(cursor: GameCursor, quarter: number): Promise<GameCursor> {
    const next = GameState.from(cursor).toQuarter(quarter, await this.openingReceiver()).toCursor();
    await writeGameCursor(this.db, this.gameId, next);
    return next;
  }

  /**
   * The per-side player defaults, rebuilt from the plays already recorded.
   *
   * Read from the database rather than held in memory so they survive a
   * reload, like everything else the tracker shows. Folded oldest-first, so
   * the most recent non-null value for each role wins.
   */
  async recentPlayers(): Promise<DefaultsByTeam> {
    const rows = await this.db.all<{
      possession: 'us' | 'them';
      quarterback_number: number | null;
      receiver_number: number | null;
      kicker_number: number | null;
      punter_number: number | null;
    }>(
      `SELECT possession, quarterback_number, receiver_number,
              kicker_number, punter_number
       FROM snaps WHERE game_id = ? ORDER BY sequence_number ASC`,
      [this.gameId],
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
   * Who received the opening kickoff, read off the first play of the game.
   *
   * If that was a kickoff, the other side received it. If it was anything
   * else, the coach started tracking after the kick, and whoever had the ball
   * first is who received. With nothing recorded, the tracker opens with our
   * ball -- see `GameState.opening`.
   */
  private async openingReceiver(): Promise<Possession> {
    const [first] = await listSnaps(this.db, this.gameId, { order: 'asc', limit: 1 });
    if (!first) return GameState.opening().possession;
    return first.kind === 'KICKOFF' ? otherTeam(first.possession) : first.possession;
  }
}

// ---------------------------------------------------------------------------
// Procedural entry points: one GameTracker call each, for callers holding a
// database and an id rather than a tracker. The logic lives above, once.
// ---------------------------------------------------------------------------

export const loadTracker = (db: Database, gameId: number): Promise<TrackerSnapshot> =>
  new GameTracker(db, gameId).load();

export const recordPlay = (
  db: Database, gameId: number, cursor: GameCursor, form: PlayForm, roster: Player[],
): Promise<RecordPlayOutcome> => new GameTracker(db, gameId).record(cursor, form, roster);

export const undoLastPlay = (db: Database, gameId: number): Promise<UndoOutcome> =>
  new GameTracker(db, gameId).undo();

export const changeQuarter = (
  db: Database, gameId: number, cursor: GameCursor, quarter: number,
): Promise<GameCursor> => new GameTracker(db, gameId).changeQuarter(cursor, quarter);

export const recentPlayers = (db: Database, gameId: number): Promise<DefaultsByTeam> =>
  new GameTracker(db, gameId).recentPlayers();
