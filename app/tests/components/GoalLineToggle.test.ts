/**
 * The TD toggle shows what will be scored.
 *
 * `recordPlay` derives a touchdown from the yardage, so a coach who never
 * presses TD still gets six points. The button has to say so before the save
 * rather than after it, or the form and the scoreboard tell different
 * stories. Both read `touchdownFromYardage`, and this is what holds them to
 * the same answer through a real render.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import RunForm from '../../src/lib/components/tracker/forms/RunForm.svelte';
import { blankForm, emptyDefaults, type RunForm as RunFormShape } from '../../src/lib/game/playForm';

afterEach(cleanup);

function mount(form: Partial<RunFormShape>, ballPosition: number, possession: 'us' | 'them') {
  render(RunForm, {
    form: { ...(blankForm('run') as RunFormShape), ...form },
    roster: [], playbook: [], busy: false,
    defaults: emptyDefaults()[possession],
    possession, ballPosition,
    onsave: () => {}, oncancel: () => {},
  });
  return screen.getByRole('button', { name: 'TD' });
}

describe('the TD toggle', () => {
  it('lights up when the yardage reaches the goal line', () => {
    // Ours, first and goal on the opponent's 5.
    expect(mount({ yardsGained: 5 }, 45, 'us')).toHaveAttribute('aria-pressed', 'true');
  });

  it('lights up for them driving the other way', () => {
    // The demo's opening situation: them, first and goal on our 5.
    expect(mount({ yardsGained: 5 }, -45, 'them')).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays dark when the play stops short', () => {
    expect(mount({ yardsGained: 4 }, 45, 'us')).toHaveAttribute('aria-pressed', 'false');
  });

  it('stays dark when the ball was fumbled away over the line', () => {
    expect(mount({ yardsGained: 5, fumbled: true, fumbleLost: true }, 45, 'us'))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('still honours the coach pressing it on a short gain', () => {
    expect(mount({ yardsGained: 2, isTouchdown: true }, 20, 'us'))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
