import { describe, expect, it } from 'vitest';
import { pointsFor, pointsForSnap } from '../../src/lib/game/score';
import { blankForm } from '../../src/lib/game/playForm';
import { makeSnap } from '../support/snapFixture';

describe('scoring', () => {
  it('scores six for a rushing or receiving touchdown', () => {
    expect(pointsFor({ ...blankForm('run'), isTouchdown: true })).toBe(6);
    expect(pointsFor({ ...blankForm('pass'), isComplete: true, isTouchdown: true })).toBe(6);
    expect(pointsFor(blankForm('run'))).toBe(0);
  });

  it('scores three only for a made field goal', () => {
    expect(pointsFor({ ...blankForm('field_goal'), result: 'GOOD' })).toBe(3);
    expect(pointsFor({ ...blankForm('field_goal'), result: 'MISS' })).toBe(0);
    expect(pointsFor({ ...blankForm('field_goal'), result: 'BLOCK' })).toBe(0);
  });

  it('scores one for a PAT kick and two for a conversion', () => {
    expect(pointsFor({ ...blankForm('extra_point'), attemptType: 'KICK', result: 'GOOD' })).toBe(1);
    expect(pointsFor({ ...blankForm('extra_point'), attemptType: '2PT_RUN', result: 'GOOD' })).toBe(2);
    expect(pointsFor({ ...blankForm('extra_point'), attemptType: '2PT_PASS', result: 'GOOD' })).toBe(2);
    expect(pointsFor({ ...blankForm('extra_point'), attemptType: 'KICK', result: 'MISS' })).toBe(0);
  });

  it('scores nothing for penalties, punts and kickoffs', () => {
    expect(pointsFor(blankForm('penalty'))).toBe(0);
    expect(pointsFor(blankForm('punt'))).toBe(0);
    expect(pointsFor(blankForm('kickoff'))).toBe(0);
  });

  it('reads the same points back off a stored snap', () => {
    expect(pointsForSnap(makeSnap({ kind: 'RUN', isTouchdown: true }))).toBe(6);
    expect(pointsForSnap(makeSnap({ kind: 'PASS', isTouchdown: true }))).toBe(6);
    expect(pointsForSnap(makeSnap({ kind: 'FG', result: 'GOOD' }))).toBe(3);
    expect(pointsForSnap(makeSnap({ kind: 'XP', attemptType: 'KICK', result: 'GOOD' }))).toBe(1);
    expect(pointsForSnap(makeSnap({ kind: 'XP', attemptType: '2PT_RUN', result: 'GOOD' }))).toBe(2);
    expect(pointsForSnap(makeSnap({ kind: 'PUNT' }))).toBe(0);
  });

  it('scores nothing for a FAIL result, which Django’s undo ignored', () => {
    // The schema's result CHECK admits 'FAIL' (ExtraPointSnap.Result.FAILED).
    // Django's undo only tested for GOOD's absence on some paths.
    expect(pointsForSnap(makeSnap({ kind: 'XP', attemptType: '2PT_RUN', result: 'FAIL' }))).toBe(0);
    expect(pointsForSnap(makeSnap({ kind: 'FG', result: 'FAIL' }))).toBe(0);
  });

  it('never scores a touchdown that was not marked', () => {
    expect(pointsForSnap(makeSnap({ kind: 'RUN', yardsGained: 80 }))).toBe(0);
  });

  it('scores six for a defensive touchdown on run or pass', () => {
    expect(pointsFor({ ...blankForm('run'), isDefensiveTouchdown: true })).toBe(6);
    expect(pointsFor({ ...blankForm('pass'), isDefensiveTouchdown: true })).toBe(6);
  });

  it('reads a defensive touchdown back off a stored snap', () => {
    expect(pointsForSnap(makeSnap({ kind: 'RUN', isDefensiveTouchdown: true }))).toBe(6);
    expect(pointsForSnap(makeSnap({ kind: 'PASS', isDefensiveTouchdown: true }))).toBe(6);
  });
});
