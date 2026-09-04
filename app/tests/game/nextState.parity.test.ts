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
 * Cases where the port deliberately differs, all of them coordinate bugs the
 * Python tests had frozen in place. See nextState.ts.
 */
const DEVIATIONS: Record<string, string> = {
  td: 'Python returned 35 (the opponent 15) for a PAT snap; correct spot is the opponent 3.',
  punt_tb: 'Python returned -20, which is our own 30; a punt touchback is their own 20.',
  fg_good: 'Python returned 35 (the opponent 15); a kickoff is from our own 35.',
  xp: 'Python returned 35 (the opponent 15); a kickoff is from our own 35.',
  clamp_opp: 'Python left the first-down path unclamped and returned 51, past the goal line.',
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

const run = (c: Case) =>
  computeNextState(
    { down: c.s.down, distance: c.s.distance, ballPosition: c.s.ball_position },
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
      // these ever match again, the deviation entry is stale.
      expect(ts.ballPosition, DEVIATIONS[name]).not.toBe(py.ball_position);
    },
  );

  it('accounts for every case', () => {
    expect(matching.length + deviating.length).toBe(cases.length);
    for (const name of Object.keys(DEVIATIONS)) {
      expect(cases.some((c) => c.n === name), `stale deviation: ${name}`).toBe(true);
    }
  });
});
