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
import { countSnaps, listSnaps } from '../../src/lib/db/repositories/snaps';
import { createPlay } from '../../src/lib/db/repositories/plays';
import type { Database } from '../../src/lib/db/driver';

/** Jersey numbers on the seeded roster. Forms take the number now, not an id. */

/** Jersey numbers on the seeded roster. Forms take the number, not an id. */
const QB = 7;
const K = 3;

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
    // The run form now has two number inputs: the jersey and the yardage.
    const yards = screen.getByLabelText('Yards gained');
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
    // Punt and field goal are one choice; from our own 25 it opens on a punt.
    await user.click(screen.getByRole('button', { name: 'Punt / Field Goal' }));
    expect(screen.getByRole('button', { name: 'Punt' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Field Goal' }));
    expect(screen.getByRole('button', { name: /Save Field Goal/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save Field Goal/ }));
    await waitFor(() => expect(screen.getByText('KICKOFF')).toBeInTheDocument());
    expect((await getGame(db, gameId))?.teamScore).toBe(3);
  });

  it('takes a ball carrier by jersey number and links one of ours', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Run' }));

    const jersey = screen.getByLabelText(/Ball carrier/);
    await user.type(jersey, '22');
    // Matching the roster is shown inline rather than gating the entry.
    await waitFor(() => expect(screen.getByText('Alex Danforth')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Yards gained'), '6');
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(() =>
      expect(within(screen.getByRole('list')).getByText(/Danforth run for 6 yds/))
        .toBeInTheDocument(),
    );
  });

  it('offers roster numbers as one-tap chips', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    // #22 is our running back; the chip fills the field without typing.
    await user.click(screen.getByRole('button', { name: '22' }));

    expect(screen.getByLabelText(/Ball carrier/)).toHaveValue(22);
    expect(screen.getByText('Alex Danforth')).toBeInTheDocument();
  });

  it('records an opponent carrier who is on no roster', async () => {
    const user = userEvent.setup();
    await mounted();

    // Give them the ball.
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: 'INT' }));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Run' }));
    // The ball carrier is theirs, so it is labelled as such and offers no
    // roster shortcut. The defence section below it DOES offer chips, because
    // the tackler is one of ours -- so the assertion is scoped to the field.
    const carrier = screen.getByLabelText(/Ball carrier/);
    const carrierField = carrier.closest('.jersey') as HTMLElement;
    expect(within(carrierField).getByText('opponent')).toBeInTheDocument();
    expect(within(carrierField).queryByRole('button', { name: '22' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Ball carrier/), '40');
    await user.type(screen.getByLabelText('Yards gained'), '8');
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(() =>
      expect(within(screen.getByRole('list')).getByText('#40 run for 8 yds')).toBeInTheDocument(),
    );
  });

  it('carries the quarterback forward to the next pass', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.type(screen.getByLabelText(/Quarterback/), String(QB));
    await user.click(screen.getByRole('button', { name: 'Complete' }));
    await user.type(screen.getByLabelText('Yards gained'), '9');
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Pass' }));

    // Same quarterback, already filled in, and flagged as carried over.
    expect(screen.getByLabelText(/Quarterback/)).toHaveValue(QB);
    expect(screen.getAllByText('↺ last play').length).toBeGreaterThan(0);
  });

  it('lets a carried-over player be replaced', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.type(screen.getByLabelText(/Quarterback/), String(QB));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    const field = screen.getByLabelText(/Quarterback/);
    await user.clear(field);
    await user.type(field, '12');

    expect(field).toHaveValue(12);
    // No longer the remembered value, so the carried flag goes away.
    expect(screen.queryByText('↺ last play')).not.toBeInTheDocument();
  });

  it('does not carry our players over to the opponent', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.type(screen.getByLabelText(/Quarterback/), String(QB));
    await user.click(screen.getByRole('button', { name: 'INT' }));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Pass' }));

    // They have the ball now. Our quarterback says nothing about theirs.
    expect(screen.getByLabelText(/Quarterback/)).toHaveValue(null);
    expect(screen.queryByText('↺ last play')).not.toBeInTheDocument();
  });

  it('remembers the kicker across a scoring chain', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Special Teams' }));
    await user.click(screen.getByRole('button', { name: 'Punt / Field Goal' }));
    await user.click(screen.getByRole('button', { name: 'Field Goal' }));
    await user.type(screen.getByLabelText(/Kicker/), String(K));
    await user.click(screen.getByRole('button', { name: /Save Field Goal/ }));

    // The kickoff opens itself, already holding the same kicker.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save Kickoff/ })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/Kicker/)).toHaveValue(K);
  });

  it('records the play call, and switches unit with possession', async () => {
    const user = userEvent.setup();
    await createPlay(db, { unitType: 'OFF', formation: 'Shotgun', name: 'Zone Read' });
    await createPlay(db, { unitType: 'DEF', formation: '4-3', name: 'Cover 2' });
    await mounted();

    // Our ball: the picker offers offensive formations.
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: 'Shotgun' }));
    await user.click(screen.getByRole('button', { name: 'Zone Read' }));
    await user.type(screen.getByLabelText('Yards gained'), '5');
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(async () => {
      const snap = (await listSnaps(db, gameId))[0];
      expect(snap.formation).toBe('Shotgun');
      expect(snap.playId).not.toBeNull();
    });

    // Hand it over, and the picker follows to the defensive book.
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: 'INT' }));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByRole('button', { name: '4-3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shotgun' })).not.toBeInTheDocument();
  });

  it('offers the defense section only when the opponent has the ball', async () => {
    const user = userEvent.setup();
    await mounted();

    // Our ball: nobody to tackle.
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.queryByText('Our defense')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Give them the ball.
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: 'INT' }));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('Our defense')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tackler/)).toBeInTheDocument();
  });

  it('records a tackler and an assist on their run', async () => {
    const user = userEvent.setup();
    await mounted();

    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: 'INT' }));
    await user.click(screen.getByRole('button', { name: /Save Pass Play/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Run' }));
    // Their carrier is a bare number; our tackler comes off the roster.
    await user.type(screen.getByLabelText(/Ball carrier/), '30');
    await user.type(screen.getByLabelText(/Tackler/), '22');

    // Assist chips appear once a tackler is named, and exclude them.
    const assists = await screen.findByText('Assisted by');
    const chips = within(assists.parentElement as HTMLElement).getAllByRole('button');
    expect(chips.map((c) => c.textContent?.trim())).not.toContain('22');

    await user.click(screen.getByRole('button', { name: 'TFL' }));
    await user.click(screen.getByRole('button', { name: /Save Run Play/ }));

    await waitFor(async () => {
      const snaps = await listSnaps(db, gameId);
      const theirRun = snaps.find((s) => s.kind === 'RUN' && s.possession === 'them');
      expect(theirRun?.primaryPlayerNumber).toBe(22);
      expect(theirRun?.tackleForLoss).toBe(true);
      // Theirs has a number and no link; ours has both.
      expect(theirRun?.ballCarrierId).toBeNull();
      expect(theirRun?.primaryPlayerId).not.toBeNull();
    });
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
