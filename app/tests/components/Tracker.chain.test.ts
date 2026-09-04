/**
 * The tracker, driven the way a coach drives it.
 *
 * Everything below the UI is already covered in the node project against
 * real SQLite. What only a mounted component can show is that the pieces are
 * wired together: that pressing Run and TD actually records a touchdown,
 * that the extra-point form opens by itself afterwards, and that undo puts
 * the score back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import Tracker from '../../src/routes/Tracker.svelte';
import { createTestDb } from '../support/testDb';
import { seedGame, seedPlayer } from '../support/seed';
import { setDb } from '../../src/lib/db/context';
import { router } from '../../src/lib/router.svelte';
import { clear as clearToasts } from '../../src/lib/ui/toasts.svelte';
import { getGame } from '../../src/lib/db/repositories/games';
import { countSnaps } from '../../src/lib/db/repositories/snaps';
import type { Database } from '../../src/lib/db/driver';

let db: Database;
let gameId: number;

beforeEach(async () => {
  db = await createTestDb();
  const seeded = await seedGame(db);
  gameId = seeded.gameId;
  await seedPlayer(db, seeded.teamId, { lastName: 'Danforth', position: 'RB', number: 22 });
  await seedPlayer(db, seeded.teamId, { lastName: 'Bell', position: 'K', number: 3 });

  setDb(db);
  router.params = { id: String(gameId) };
  clearToasts();
});

afterEach(() => {
  cleanup();
  clearToasts();
});

/**
 * Wait for the play grid, i.e. loadTracker has resolved and the tracker is
 * at rest. The team abbreviation is not a usable signal: it appears in the
 * scoreboard and again as the end-zone label on the field.
 */
async function mounted() {
  render(Tracker);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument(),
  );
}

describe('tracker', () => {
  it('shows the opening situation', async () => {
    await mounted();

    expect(screen.getByText('Q1')).toBeInTheDocument();
    expect(screen.getByText('1st & 10')).toBeInTheDocument();
    expect(screen.getByText('No plays yet. Pick a play type above.')).toBeInTheDocument();
    // Both end zones are labelled and stay put for the whole game.
    expect(screen.getAllByText('NSR').length).toBeGreaterThanOrEqual(2);
  });

  it('records a run and advances the down and distance', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: '+4' }));
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(() => expect(screen.getByText('2nd & 6')).toBeInTheDocument());
    expect(await countSnaps(db, gameId)).toBe(1);
    // Scoped to the feed: the summary also renders inside the (closed) undo
    // confirmation dialog.
    const feed = screen.getByRole('list');
    expect(within(feed).getByText(/run for 4 yds/)).toBeInTheDocument();
    expect(within(feed).getByText('#1')).toBeInTheDocument();
  });

  it('opens the extra point by itself after a touchdown, then returns to kickoff', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: '+20' }));
    await user.click(screen.getByRole('button', { name: 'TD' }));
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    // The chain: no button was pressed to get here.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save Extra Point/ })).toBeInTheDocument(),
    );
    expect(screen.getByText('EXTRA POINT')).toBeInTheDocument();
    expect((await getGame(db, gameId))?.teamScore).toBe(6);

    await user.click(screen.getByRole('button', { name: /Save Extra Point/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save Kickoff/ })).toBeInTheDocument(),
    );
    expect(screen.getByText('KICKOFF')).toBeInTheDocument();
    expect((await getGame(db, gameId))?.teamScore).toBe(7);
  });

  it('takes the points back off when the play is undone', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: '+20' }));
    await user.click(screen.getByRole('button', { name: 'TD' }));
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));
    await waitFor(() => expect(screen.getByText('EXTRA POINT')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Undo/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(screen.getByText('1st & 10')).toBeInTheDocument());
    expect((await getGame(db, gameId))?.teamScore).toBe(0);
    expect(await countSnaps(db, gameId)).toBe(0);
  });

  it('makes contradictory pass outcomes unreachable', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Pass' }));

    // A touchdown pass must be complete, so pressing TD marks the completion.
    await user.click(screen.getByRole('button', { name: 'TD' }));
    expect(screen.getByRole('button', { name: 'TD' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Complete' })).toHaveAttribute('aria-pressed', 'true');

    // Declaring a sack clears both -- the coach cannot submit the
    // contradiction validate.ts would reject.
    await user.click(screen.getByRole('button', { name: 'Sack' }));
    expect(screen.getByRole('button', { name: 'Sack' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Complete' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'TD' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports an out-of-range value without recording anything', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    const yards = screen.getByRole('spinbutton');
    await user.clear(yards);
    await user.type(yards, '500');
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Yards gained must be between/i),
    );
    expect(await countSnaps(db, gameId)).toBe(0);
    // The error persists until dismissed rather than fading.
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('reaches the kicking forms through the special teams menu', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Special Teams' }));
    expect(screen.getByRole('button', { name: 'Punt' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Field Goal' }));
    expect(screen.getByRole('button', { name: /Save Field Goal/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save Field Goal/ }));
    await waitFor(() => expect(screen.getByText('KICKOFF')).toBeInTheDocument());
    expect((await getGame(db, gameId))?.teamScore).toBe(3);
  });

  it('does not move the ball on screen when it is intercepted', async () => {
    const user = userEvent.setup();
    await mounted();

    // The field's label carries both facts: where the ball is, and who is
    // driving. Before the turnover, we have it on our own 25.
    expect(screen.getByLabelText('Ball at OWN 25, NSR driving')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: 'INT' }));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));

    // Same spot, other team. The old model mirrored this to OPP 25, so the
    // ball appeared to jump the width of the field.
    await waitFor(() =>
      expect(screen.getByLabelText('Ball at OWN 25, Westfield driving')).toBeInTheDocument(),
    );
    expect(screen.getByText('1st & 10')).toBeInTheDocument();

    const game = await getGame(db, gameId);
    expect(game?.currentBallPosition).toBe(-25);
    expect(game?.currentPossession).toBe('them');
  });

  it('swaps ends for halftime without moving the ball', async () => {
    const user = userEvent.setup();
    await mounted();

    expect((await getGame(db, gameId))?.sidesSwapped).toBe(false);

    await user.click(screen.getByRole('button', { name: /Ends/ }));

    await waitFor(async () =>
      expect((await getGame(db, gameId))?.sidesSwapped).toBe(true),
    );
    // Swapping ends is presentation only: the stored coordinate is untouched.
    expect((await getGame(db, gameId))?.currentBallPosition).toBe(-25);
    expect(screen.getByLabelText('Ball at OWN 25, NSR driving')).toBeInTheDocument();
  });

  it('persists a quarter change immediately', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Q1' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Set' }));

    await waitFor(() => expect(screen.getByText('Q3')).toBeInTheDocument());
    // Django kept this client-side only, so a reload before the next play
    // lost it entirely.
    expect((await getGame(db, gameId))?.currentQuarter).toBe(3);
  });
});
