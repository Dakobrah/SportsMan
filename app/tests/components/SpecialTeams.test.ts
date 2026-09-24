/**
 * Special teams and the scores a backed-up offense can give away, driven
 * through the tracker the way a coach drives it.
 *
 * The rules themselves are covered in tests/game/footballRules.test.ts; what
 * only a mounted component can show is that the right choices are on screen
 * at the right moment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import SpecialTeamsMenu from '../../src/lib/components/tracker/SpecialTeamsMenu.svelte';
import Tracker from '../../src/routes/Tracker.svelte';
import type { Situation } from '../../src/lib/db/repositories/types';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { setDb } from '../../src/lib/db/context';
import { router } from '../../src/lib/router.svelte';
import { clear as clearToasts } from '../../src/lib/ui/toasts.svelte';
import { getGame } from '../../src/lib/db/repositories/games';
import type { Database } from '../../src/lib/db/driver';

afterEach(() => {
  cleanup();
  clearToasts();
});

describe('the special teams menu offers what the situation allows', () => {
  function mount(situation: Situation) {
    const props = { situation, onselect: vi.fn(), onkick: vi.fn(), onback: vi.fn() };
    render(SpecialTeamsMenu, { props });
    return props;
  }
  const button = (name: string) => screen.queryByRole('button', { name });

  it('offers only the try when one is pending', async () => {
    const { onselect } = mount('extra_point');
    expect(button('PAT / 2pt')).toBeInTheDocument();
    expect(button('Kickoff')).not.toBeInTheDocument();
    expect(button('Punt / Field Goal')).not.toBeInTheDocument();
    await userEvent.click(button('PAT / 2pt')!);
    expect(onselect).toHaveBeenCalledWith('extra_point');
  });

  it('offers only the kickoff when one is pending', () => {
    mount('kickoff');
    expect(button('Kickoff')).toBeInTheDocument();
    expect(button('PAT / 2pt')).not.toBeInTheDocument();
    expect(button('Punt / Field Goal')).not.toBeInTheDocument();
  });

  it.each(['normal', 'turnover', 'turnover_on_downs', 'opponent_ball'] as const)(
    'offers the kick from scrimmage on a down (%s)',
    async (situation) => {
      const { onkick } = mount(situation);
      await userEvent.click(button('Punt / Field Goal')!);
      expect(onkick).toHaveBeenCalled();
      expect(button('PAT / 2pt')).not.toBeInTheDocument();
    },
  );

  it('still offers the kickoff on a down, for the opening kick', () => {
    // The tracker opens on first and ten with the kick already assumed; a
    // coach recording the opening kickoff reaches it from here.
    mount('normal');
    expect(button('Kickoff')).toBeInTheDocument();
  });

  it('always offers a way back', async () => {
    const { onback } = mount('kickoff');
    await userEvent.click(button('‹ Back')!);
    expect(onback).toHaveBeenCalled();
  });
});

describe('in the tracker', () => {
  let db: Database;
  let gameId: number;

  beforeEach(async () => {
    db = await createTestDb();
    const seeded = await seedGame(db);
    gameId = seeded.gameId;
    await seedPlayer(db, seeded.teamId, { lastName: 'Danforth', position: 'RB', number: 22 });
    setDb(db);
    router.params = { id: String(gameId) };
    clearToasts();
  });

  async function mounted() {
    render(Tracker);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());
  }

  async function run(yards: number) {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.clear(screen.getByLabelText('Yards gained'));
    await user.type(screen.getByLabelText('Yards gained'), String(yards));
    return user;
  }

  it('only offers Safety when backed up near our own goal line', async () => {
    await mounted();
    const user = await run(3);
    // Our 25: a safety cannot happen from here, so the toggle is not offered.
    expect(screen.queryByRole('button', { name: 'Safety' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Lose eighteen to our 7.
    const again = await run(-18);
    await again.click(screen.getByRole('button', { name: /Save Run Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());

    await run(0);
    expect(screen.getByRole('button', { name: 'Safety' })).toBeInTheDocument();
  });

  it('scores a safety off the yardage and opens the free kick', async () => {
    await mounted();
    const user = await run(-18);
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());

    // From our 7, a loss of eight ends in our end zone. The toggle lights
    // before anyone presses it.
    const next = await run(-8);
    expect(screen.getByRole('button', { name: 'Safety' })).toHaveAttribute('aria-pressed', 'true');
    await next.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save Kickoff/ })).toBeInTheDocument(),
    );
    expect((await getGame(db, gameId))?.opponentScore).toBe(2);
  });

  it('asks who recovered an onside kick', async () => {
    const user = userEvent.setup();
    await mounted();
    await user.click(screen.getByRole('button', { name: 'Special Teams' }));
    await user.click(screen.getByRole('button', { name: 'Kickoff' }));

    expect(screen.queryByRole('button', { name: 'We recovered' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Onside' }));
    expect(screen.getByLabelText('Kick distance')).toHaveValue(11);

    await user.click(screen.getByRole('button', { name: 'We recovered' }));
    // Nobody returned it, so the returner fields go away.
    expect(screen.queryByLabelText('Return yards')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save Kickoff/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());
    expect((await getGame(db, gameId))?.currentPossession).toBe('us');
  });

  it('opens the second-half kickoff when the quarter moves to the third', async () => {
    const user = userEvent.setup();
    await mounted();
    await user.click(screen.getByRole('button', { name: 'Q1' }));
    const quarter = screen.getByRole('spinbutton');
    await user.clear(quarter);
    await user.type(quarter, '3');
    await user.click(screen.getByRole('button', { name: 'Set' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save Kickoff/ })).toBeInTheDocument(),
    );
  });
});
