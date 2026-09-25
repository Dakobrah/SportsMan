/**
 * Drives, segmented from the plays.
 *
 * Django's `get_drive_by_drive` grouped only on a quarter change, over run
 * and pass rows, with no concept of possession -- so it produced at most four
 * "drives" a game and labelled a lost fumble a turnover on downs. This is a
 * replacement, not a port.
 *
 * The rule that matters is that a KICKOFF or an EXTRA POINT belongs to no
 * drive and ENDS the one in progress. Without it, a team's last drive of the
 * first half merges with their first of the third quarter -- same team,
 * possession never changed -- and the count comes out one short. With it,
 * segmentation matches the nflverse drive column body-for-body on a real
 * game.
 */
import type { Possession } from '../game/field';
import { isRedZoneFor, yardsToGoalFor } from '../game/field';
import { cursorAfter } from '../game/cursor';
import { Ruleset } from '../game/engine/Ruleset';
import { pointsForSnap } from '../game/score';
import type { Snap } from '../db/repositories/types';

export type DriveOutcome =
  | 'touchdown'
  | 'field_goal'
  | 'missed_fg'
  | 'punt'
  | 'downs'
  | 'interception'
  | 'fumble'
  | 'end_of_period';

export interface Drive {
  index: number;
  gameId: number;
  possession: Possession;
  quarter: number;
  startSequence: number;
  endSequence: number;
  plays: number;
  startPosition: number;
  endPosition: number;
  /** Net yards toward the goal this side was attacking. */
  yards: number;
  yardsToGoalAtStart: number;
  reachedRedZone: boolean;
  outcome: DriveOutcome;
  points: number;
}

/** Kicks and tries sit between drives rather than inside one. */
const BETWEEN_DRIVES = new Set(['KICKOFF', 'XP']);

function outcomeOf(last: Snap): DriveOutcome {
  if (last.isTouchdown) return 'touchdown';
  if (last.isInterception) return 'interception';
  if (last.fumbleLost) return 'fumble';
  if (last.kind === 'FG') return last.result === 'GOOD' ? 'field_goal' : 'missed_fg';
  if (last.kind === 'PUNT') return 'punt';
  // Fourth down, and the drive stopped without any of the above.
  if (last.down === 4) return 'downs';
  return 'end_of_period';
}

/**
 * `rules` is the season's: where a drive ended is replayed from its last
 * play, and that depends on the level's kickoff, try and touchback spots.
 */
export function segmentDrives(snaps: Snap[], rules: Ruleset = Ruleset.default): Drive[] {
  const ordered = [...snaps].sort(
    (a, b) => a.gameId - b.gameId || a.sequenceNumber - b.sequenceNumber,
  );

  const drives: Drive[] = [];
  let current: Snap[] = [];
  let previous: Snap | undefined;

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    const endPosition = cursorAfter(last, rules).ballPosition;
    const startPosition = first.ballPosition ?? 0;

    drives.push({
      index: drives.length + 1,
      gameId: first.gameId,
      possession: first.possession,
      quarter: first.quarter,
      startSequence: first.sequenceNumber,
      endSequence: last.sequenceNumber,
      plays: current.length,
      startPosition,
      endPosition,
      yards:
        yardsToGoalFor(startPosition, first.possession) -
        yardsToGoalFor(endPosition, first.possession),
      yardsToGoalAtStart: yardsToGoalFor(startPosition, first.possession),
      reachedRedZone: current.some(
        (s) => s.ballPosition !== null && isRedZoneFor(s.ballPosition, s.possession),
      ),
      outcome: outcomeOf(last),
      points: current.reduce((sum, s) => sum + pointsForSnap(s), 0),
    });
    current = [];
  };

  for (const snap of ordered) {
    if (BETWEEN_DRIVES.has(snap.kind)) {
      flush();
      previous = snap;
      continue;
    }
    const broken =
      previous !== undefined &&
      (previous.gameId !== snap.gameId ||
        previous.possession !== snap.possession ||
        BETWEEN_DRIVES.has(previous.kind));
    if (broken) flush();

    current.push(snap);
    previous = snap;
  }
  flush();

  return drives;
}

export interface RedZoneSummary {
  trips: number;
  touchdowns: number;
  fieldGoals: number;
  /** Trips that produced any points, as a percentage. */
  scorePct: number;
  tdPct: number;
}

/**
 * Red zone efficiency, per TRIP rather than per play.
 *
 * A drive that reaches the twenty and stalls is one failed trip, not eight
 * failed snaps -- which is why this needs drives and cannot live in the SQL
 * layer.
 */
export function redZone(drives: Drive[]): RedZoneSummary {
  const trips = drives.filter((d) => d.reachedRedZone);
  const touchdowns = trips.filter((d) => d.outcome === 'touchdown').length;
  const fieldGoals = trips.filter((d) => d.outcome === 'field_goal').length;
  const scored = touchdowns + fieldGoals;
  return {
    trips: trips.length,
    touchdowns,
    fieldGoals,
    scorePct: trips.length === 0 ? 0 : (scored / trips.length) * 100,
    tdPct: trips.length === 0 ? 0 : (touchdowns / trips.length) * 100,
  };
}
