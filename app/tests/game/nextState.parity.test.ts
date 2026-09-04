/**
 * Parity against the Django original.
 *
 * `nextState.python.json` is the recorded output of
 * `apps.core.helpers.compute_next_state` for the cases in
 * `nextState.cases.json`. Every case must either match the TypeScript port
 * exactly, or appear in DEVIATIONS below with a reason.
 *
 * The point is to make an unintended behaviour change impossible to land
 * quietly: a new mismatch fails the suite. The fixture also outlives the
 * Django code, which is deleted once the port is complete.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeNextState, type PlayType } from '../../src/lib/game/nextState';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const load = (name: string) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

interface PythonState {
  down: number | null;
  distance: number | null;
  ball_position: number;
  situation: string;
}

/**
 * Cases where the port deliberately differs.
 *
 * The first group are coordinate bugs the Python tests had frozen in place.
 * The second are consequences of one deliberate model change: Python tracked
 * field position RELATIVE to whoever had the ball, so every change of
 * possession mirrored the coordinate across midfield. The ball therefore
 * appeared to jump the width of the field on an interception. Here the frame
 * is absolute for the whole game and possession is its own value, so a
 * turnover changes who is driving and leaves the ball alone. See nextState.ts.
 */
const DEVIATIONS: Record<string, string> = {
  // Coordinate bugs.
  td: 'Python returned 35 (the opponent 15) for a PAT snap; correct spot is the opponent 3.',
  punt_tb: 'Python returned -20, our own 30. A punt touchback is the RECEIVING team\'s own 20, so +30 when we punted.',
  fg_good: 'Python returned 35 (the opponent 15); a kickoff is from our own 35.',
  xp: 'Python returned 35 (the opponent 15); a kickoff is from our own 35.',
  clamp_opp: 'Python left the first-down path unclamped and returned 51, past the goal line.',

  // Consequences of the absolute frame.
  int: 'Python mirrored our own 20 to +30 on the interception. A turnover moves nobody: they take over on that spot.',
  fumble: 'Python mirrored the recovery spot to +18. The ball stays at our own 32 and possession changes.',
  kickoff: 'Python gave the receiver our own 25 whoever kicked. We kicked, so they start on THEIR 25, at +25.',
  punt: 'Python mirrored the landing spot to -10. The ball stays where it landed, at their 40.',
  fg_miss: 'Python mirrored the spot to -15. The defence takes over exactly where the kick was attempted.',
  downs: 'Python mirrored the spot to +24. On downs the defence takes over where the ball stopped, our own 26.',
};

const toCamel = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]),
  );

interface Case {
  n: string;
  s: { down: number | null; distance: number | null; ball_position: number };
  t: string;
  d: Record<string, unknown>;
  r: Record<string, unknown>;
}

const cases: Case[] = load('nextState.cases.json');
const python: Record<string, PythonState> = load('nextState.python.json');

// Every fixture was recorded from our own perspective, so the offence in
// each case is us.
const run = (c: Case) =>
  computeNextState(
    { down: c.s.down, distance: c.s.distance, ballPosition: c.s.ball_position, possession: 'us' },
    c.t as PlayType,
    toCamel(c.d),
    toCamel(c.r),
  );

describe('parity with the Django compute_next_state', () => {
  const matching = cases.filter((c) => !(c.n in DEVIATIONS));
  const deviating = cases.filter((c) => c.n in DEVIATIONS);

  it.each(matching.map((c) => [c.n, c] as const))('matches Python for %s', (_name, c) => {
    const ts = run(c);
    const py = python[c.n];
    expect({
      down: ts.down,
      distance: ts.distance,
      ball_position: ts.ballPosition,
      situation: ts.situation,
    }).toEqual(py);
  });

  it.each(deviating.map((c) => [c.n, c] as const))(
    'deliberately differs from Python for %s',
    (name, c) => {
      const ts = run(c);
      const py = python[name];
      // Guard against a "fix" that quietly restores the old behaviour: if
      // these ever match again, the deviation entry is stale. Compared as a
      // whole state, since some deviations differ in down or distance rather
      // than position alone.
      expect(
        {
          down: ts.down,
          distance: ts.distance,
          ball_position: ts.ballPosition,
          situation: ts.situation,
        },
        DEVIATIONS[name],
      ).not.toEqual(py);
    },
  );

  it('accounts for every case', () => {
    expect(matching.length + deviating.length).toBe(cases.length);
    for (const name of Object.keys(DEVIATIONS)) {
      expect(cases.some((c) => c.n === name), `stale deviation: ${name}`).toBe(true);
    }
  });
});
