import { describe, expect, it } from 'vitest';
import { playerLookup, snapYardage, summarize } from '../../src/lib/game/summary';
import { makePlayer, makeSnap } from '../support/snapFixture';

const players = playerLookup([
  makePlayer({ id: 1, number: 22, lastName: 'Danforth', position: 'RB' }),
  makePlayer({ id: 2, number: 7, lastName: 'Okafor', position: 'QB' }),
  makePlayer({ id: 3, number: 81, lastName: 'Vance', position: 'WR' }),
]);

describe('play summaries', () => {
  it('describes a run', () => {
    expect(summarize(makeSnap({ kind: 'RUN', ballCarrierId: 1, yardsGained: 12 }), players))
      .toBe('#22 Danforth run for 12 yds');
  });

  it('falls back to Unknown when nobody was attached', () => {
    expect(summarize(makeSnap({ kind: 'RUN', yardsGained: 3 }), players))
      .toBe('Unknown run for 3 yds');
    // A player deleted since the play was recorded reads the same way.
    expect(summarize(makeSnap({ kind: 'RUN', ballCarrierId: 99 }), players))
      .toBe('Unknown run for 0 yds');
  });

  it('describes each pass outcome distinctly', () => {
    const pass = { kind: 'PASS' as const, quarterbackId: 2 };
    expect(summarize(makeSnap({ ...pass, isComplete: true, receiverId: 3, yardsGained: 18 }), players))
      .toBe('#7 Okafor to #81 Vance for 18 yds');
    expect(summarize(makeSnap({ ...pass, isComplete: false }), players))
      .toBe('#7 Okafor pass incomplete');
    expect(summarize(makeSnap({ ...pass, isInterception: true }), players))
      .toBe('#7 Okafor INTERCEPTED');
    expect(summarize(makeSnap({ ...pass, wasSacked: true, sackYards: -7 }), players))
      .toBe('#7 Okafor sacked for -7 yds');
  });

  it('prefers the sack description over the completion one', () => {
    // A sack is checked first, matching tracker.py's ordering.
    const snap = makeSnap({ kind: 'PASS', quarterbackId: 2, wasSacked: true, sackYards: -3, isComplete: true });
    expect(summarize(snap, players)).toContain('sacked');
  });

  it('omits the receiver when a completion has none recorded', () => {
    expect(summarize(makeSnap({ kind: 'PASS', quarterbackId: 2, isComplete: true, yardsGained: 5 }), players))
      .toBe('#7 Okafor for 5 yds');
  });

  it('describes kicks', () => {
    expect(summarize(makeSnap({ kind: 'FG', result: 'GOOD', kickDistance: 38 }), players))
      .toBe('FG GOOD (38 yds)');
    expect(summarize(makeSnap({ kind: 'XP', attemptType: 'KICK', result: 'GOOD' }), players))
      .toBe('PAT GOOD');
    expect(summarize(makeSnap({ kind: 'XP', attemptType: '2PT_RUN', result: 'MISS' }), players))
      .toBe('2PT MISS');
  });

  it('describes kickoffs and punts, flagging touchbacks and blocks', () => {
    expect(summarize(makeSnap({ kind: 'KICKOFF', kickYards: 62 }), players))
      .toBe('Kickoff 62 yds');
    expect(summarize(makeSnap({ kind: 'KICKOFF', kickYards: 65, isTouchback: true }), players))
      .toBe('Kickoff 65 yds (TB)');
    expect(summarize(makeSnap({ kind: 'PUNT', puntYards: 41 }), players))
      .toBe('Punt 41 yds');
    expect(summarize(makeSnap({ kind: 'PUNT', isBlocked: true }), players))
      .toBe('BLOCKED punt');
  });

  it('describes penalties, naming the side when there is no description', () => {
    expect(summarize(makeSnap({ kind: 'PENALTY', penaltyDescription: 'Holding' }), players))
      .toBe('PENALTY: Holding');
    expect(summarize(makeSnap({ kind: 'PENALTY', penaltyOnOffense: true }), players))
      .toBe('PENALTY: on offense');
    expect(summarize(makeSnap({ kind: 'PENALTY', penaltyOnOffense: false }), players))
      .toBe('PENALTY: on defense');
  });

  it('reports a sack’s loss rather than its zero gain', () => {
    expect(snapYardage(makeSnap({ kind: 'PASS', wasSacked: true, sackYards: -8, yardsGained: 0 }))).toBe(-8);
    expect(snapYardage(makeSnap({ kind: 'RUN', yardsGained: 5 }))).toBe(5);
    expect(snapYardage(makeSnap({ kind: 'KICKOFF' }))).toBe(0);
  });
});
