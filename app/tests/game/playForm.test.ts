import { describe, expect, it } from 'vitest';
import {
  PLAY_FORM_META,
  QUICK_YARDS,
  SELECT_POSITIONS,
  blankForm,
  type PlayFormType,
} from '../../src/lib/game/playForm';
import { POSITIONS } from '../../src/lib/db/repositories/types';

const ALL_TYPES: PlayFormType[] = [
  'run', 'pass', 'penalty', 'kickoff', 'punt', 'field_goal', 'extra_point',
];

describe('play forms', () => {
  it('builds a blank form for every type, tagged with that type', () => {
    for (const type of ALL_TYPES) {
      expect(blankForm(type).type).toBe(type);
    }
  });

  it('carries the defaults that used to live in the HTML strings', () => {
    expect(blankForm('kickoff')).toMatchObject({ kickYards: 60, isTouchback: false });
    expect(blankForm('punt')).toMatchObject({ puntYards: 40 });
    expect(blankForm('field_goal')).toMatchObject({ kickDistance: 30, result: 'GOOD' });
    expect(blankForm('extra_point')).toMatchObject({ attemptType: 'KICK', result: 'GOOD' });
    expect(blankForm('penalty')).toMatchObject({ penaltyYards: 5, accepted: true });
    expect(blankForm('run')).toMatchObject({ yardsGained: 0, ballCarrierNumber: null });
  });

  it('starts every form empty of players and notes', () => {
    for (const type of ALL_TYPES) {
      const form = blankForm(type) as unknown as Record<string, unknown>;
      expect(form.notes).toBe('');
      // Players are identified by the jersey number the coach types, so no
      // form carries a PLAYER id. `playId` is the one id here and it points
      // at the playbook, not at a person.
      for (const key of Object.keys(form)) {
        if (key.endsWith('Number') && key !== 'kickYards') expect(form[key]).toBeNull();
        if (key.endsWith('Id')) expect(key).toBe('playId');
      }
    }
  });

  it('returns a fresh object each time', () => {
    const a = blankForm('run');
    const b = blankForm('run');
    a.yardsGained = 12;
    expect(b.yardsGained).toBe(0);
  });

  it('has display metadata for every type', () => {
    for (const type of ALL_TYPES) {
      expect(PLAY_FORM_META[type].title).toBeTruthy();
      expect(PLAY_FORM_META[type].accent).toBeTruthy();
    }
  });

  it('offers quick yards in ascending order around zero', () => {
    expect([...QUICK_YARDS]).toEqual([...QUICK_YARDS].sort((a, b) => a - b));
    expect(QUICK_YARDS).toContain(0);
    expect(Math.min(...QUICK_YARDS)).toBe(-10);
  });

  it('only names positions that exist', () => {
    for (const group of Object.values(SELECT_POSITIONS)) {
      for (const position of group) expect(POSITIONS).toContain(position);
    }
  });
});
