/**
 * A pass that gained yards was caught.
 *
 * Tapping +7 on a pass ticks Complete, because an incomplete pass stores no
 * yards -- a forgotten toggle used to throw the gain away. The app only ever
 * undoes a completion it ticked itself.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import Tracker from '../../src/routes/Tracker.svelte';
import { blankForm, gainImpliesCompletion, type PassForm as PassFormShape } from '../../src/lib/game/playForm';
import { createTestDb } from '../support/testDb';
import { seedGame } from '../support/seed';
import { setDb } from '../../src/lib/db/context';
import { router } from '../../src/lib/router.svelte';
import { clear as clearToasts } from '../../src/lib/ui/toasts.svelte';

beforeEach(async () => {
  const db = await createTestDb();
  const { gameId } = await seedGame(db);
  setDb(db);
  router.params = { id: String(gameId) };
  clearToasts();
});

afterEach(() => {
  cleanup();
  clearToasts();
});

/**
 * The pass form, opened in the tracker. Mounted on its own it gets a plain
 * object, which does not re-render when the form changes it; the tracker
 * holds the form as $state, which is what the app runs.
 */
async function mount() {
  const user = userEvent.setup();
  render(Tracker);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Pass' }));
  const button = (name: string) => screen.getByRole('button', { name });
  const pressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true';
  return { user, button, pressed };
}

describe('gainImpliesCompletion', () => {
  const pass = (form: Partial<PassFormShape>) => ({ ...(blankForm('pass') as PassFormShape), ...form });

  it('reads a gain as a catch', () => {
    expect(gainImpliesCompletion(pass({ yardsGained: 7 }))).toBe(true);
  });

  it('reads nothing into no gain or a loss, since a completion can lose yards too', () => {
    expect(gainImpliesCompletion(pass({ yardsGained: 0 }))).toBe(false);
    expect(gainImpliesCompletion(pass({ yardsGained: -3 }))).toBe(false);
  });

  it('ignores a sack, whose loss is entered as a positive number', () => {
    expect(gainImpliesCompletion(pass({ yardsGained: 7, wasSacked: true }))).toBe(false);
  });

  it('ignores an interception, whose yards are not the offense\'s', () => {
    expect(gainImpliesCompletion(pass({ yardsGained: 7, isInterception: true }))).toBe(false);
  });
});

describe('the pass form', () => {
  it('ticks Complete when a gain is tapped', async () => {
    const { user, button, pressed } = await mount();
    expect(pressed('Complete')).toBe(false);
    await user.click(button('+7'));
    expect(pressed('Complete')).toBe(true);
  });

  it('unticks a completion it ticked when the gain is taken back', async () => {
    const { user, button, pressed } = await mount();
    await user.click(button('+7'));
    await user.click(button('0'));
    expect(pressed('Complete')).toBe(false);
  });

  it('never unticks a completion the coach pressed', async () => {
    const { user, button, pressed } = await mount();
    await user.click(button('Complete'));
    await user.click(button('-2'));
    // A completion for a loss is a real play.
    expect(pressed('Complete')).toBe(true);
  });

  it('leaves a sack alone when its yards are tapped', async () => {
    const { user, button, pressed } = await mount();
    await user.click(button('Sack'));
    await user.click(button('+7'));
    expect(pressed('Complete')).toBe(false);
    expect(pressed('Sack')).toBe(true);
  });

  it('turns a throwaway into a catch when a gain is tapped', async () => {
    const { user, button, pressed } = await mount();
    await user.click(button('Throwaway'));
    await user.click(button('+5'));
    expect(pressed('Complete')).toBe(true);
    expect(pressed('Throwaway')).toBe(false);
  });
});
