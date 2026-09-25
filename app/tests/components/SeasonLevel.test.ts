/**
 * Choosing a season's level of play, and the tracker following it.
 *
 * The rules per level are covered in tests/game/ruleset.test.ts. What only a
 * mounted screen can show is that a coach can set the level, change it, and
 * see the tracker start from the right spot.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import Seasons from '../../src/routes/Seasons.svelte';
import Tracker from '../../src/routes/Tracker.svelte';
import { createTestDb } from '../support/testDb';
import { seedGame } from '../support/seed';
import { setDb } from '../../src/lib/db/context';
import { router } from '../../src/lib/router.svelte';
import { clear as clearToasts } from '../../src/lib/ui/toasts.svelte';
import { getSeason, listSeasons, setSeasonRuleset } from '../../src/lib/db/repositories/seasons';
import type { Database } from '../../src/lib/db/driver';

let db: Database;
let seeded: Awaited<ReturnType<typeof seedGame>>;

beforeEach(async () => {
  db = await createTestDb();
  seeded = await seedGame(db);
  setDb(db);
  clearToasts();
});

afterEach(() => {
  cleanup();
  clearToasts();
});

describe('the seasons screen', () => {
  it('shows each season\'s level, college for one made before levels existed', async () => {
    render(Seasons);
    const level = await screen.findByLabelText('Level for 2026');
    expect(level).toHaveValue('NCAA');
  });

  it('changes a season\'s level', async () => {
    const user = userEvent.setup();
    render(Seasons);
    await user.selectOptions(await screen.findByLabelText('Level for 2026'), 'NFHS');
    await waitFor(async () => expect((await getSeason(db, seeded.seasonId))?.ruleset).toBe('NFHS'));
  });

  it('adds a season at the chosen level, starting on the newest season\'s', async () => {
    const user = userEvent.setup();
    await setSeasonRuleset(db, seeded.seasonId, 'NFL');
    render(Seasons);

    const level = await screen.findByLabelText('Level');
    await waitFor(() => expect(level).toHaveValue('NFL'));

    await user.selectOptions(screen.getByLabelText('Team'), 'Northside');
    const year = screen.getByLabelText('Year');
    await user.clear(year);
    await user.type(year, '2027');
    await user.selectOptions(level, 'NFHS');
    await user.click(screen.getByRole('button', { name: 'Add season' }));

    await waitFor(async () => {
      const added = (await listSeasons(db)).find((s) => s.year === 2027);
      expect(added?.ruleset).toBe('NFHS');
    });
  });
});

describe('the tracker', () => {
  it('opens a high-school game on our 20, where its touchback comes out', async () => {
    await setSeasonRuleset(db, seeded.seasonId, 'NFHS');
    router.params = { id: String(seeded.gameId) };
    render(Tracker);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());
    expect(screen.getAllByText('OWN 20').length).toBeGreaterThan(0);
  });
});
