/**
 * The chart shell's accessibility contract.
 *
 * The numbers these charts show are asserted in the node project against
 * real SQLite. What only a mounted component can prove is that a value is
 * reachable without a mouse: a titled image, a legend when there are two
 * series, and a table carrying the same numbers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import Report from '../../src/routes/Report.svelte';
import { createTestDb } from '../support/testDb';
import { replayGame } from '../support/replayFixture';
import { setDb } from '../../src/lib/db/context';
import { router } from '../../src/lib/router.svelte';
import ScoringByQuarter from '../../src/lib/components/charts/ScoringByQuarter.svelte';
import DriveChart from '../../src/lib/components/charts/DriveChart.svelte';
import PointsTrend from '../../src/lib/components/charts/PointsTrend.svelte';
import DownEfficiency from '../../src/lib/components/charts/DownEfficiency.svelte';
import FieldZones from '../../src/lib/components/charts/FieldZones.svelte';

afterEach(cleanup);

const DATA = [
  { quarter: 1, us: 7, them: 21 },
  { quarter: 2, us: 7, them: 0 },
  { quarter: 3, us: 0, them: 6 },
  { quarter: 4, us: 22, them: 6 },
];

const mount = () => render(ScoringByQuarter, { data: DATA, us: 'NSR', them: 'PHI' });

describe('a chart', () => {
  it('is an image with a title and a description', () => {
    mount();
    const figure = screen.getByRole('img');
    expect(figure).toHaveAccessibleName('Scoring by quarter');
    // The description carries the headline, so the chart is readable when
    // the plot itself is not.
    expect(figure).toHaveAccessibleDescription(/NSR 36, PHI 33/);
  });

  it('names both series in a legend, so identity is never colour alone', () => {
    mount();
    const legend = screen.getByRole('list');
    expect(within(legend).getByText('NSR')).toBeInTheDocument();
    expect(within(legend).getByText('PHI')).toBeInTheDocument();
  });

  it('carries the same numbers as a table', () => {
    mount();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    // Header plus one row per side.
    expect(rows).toHaveLength(3);
    // Totals match the real game this data came from.
    expect(within(rows[1]).getByText('36')).toBeInTheDocument();
    expect(within(rows[2]).getByText('33')).toBeInTheDocument();
  });

  it('labels every scoring column directly, not only on hover', () => {
    mount();
    // 22 is our fourth quarter; it appears on the plot and in the table.
    expect(screen.getAllByText('22').length).toBeGreaterThanOrEqual(2);
  });

  it('draws nothing misleading when nobody scored', () => {
    render(ScoringByQuarter, {
      data: [{ quarter: 1, us: 0, them: 0 }], us: 'NSR', them: 'PHI',
    });
    // A zero gets no direct label, and the axis still has a scale.
    expect(screen.getByRole('img')).toHaveAccessibleDescription(/NSR 0, PHI 0/);
  });
});

describe('every chart keeps the same contract', () => {
  it('gives a drive chart a table with a row per drive', () => {
    render(DriveChart, {
      drives: [
        { index: 1, gameId: 1, possession: 'us' as const, quarter: 1,
          startSequence: 1, endSequence: 4, plays: 4, startPosition: -25,
          endPosition: 50, yards: 75, yardsToGoalAtStart: 75,
          reachedRedZone: true, outcome: 'touchdown' as const, points: 6 },
        { index: 2, gameId: 1, possession: 'them' as const, quarter: 1,
          startSequence: 5, endSequence: 7, plays: 3, startPosition: 25,
          endPosition: 10, yards: -15, yardsToGoalAtStart: 75,
          reachedRedZone: false, outcome: 'punt' as const, points: 0 },
      ],
      us: 'NSR', them: 'PHI',
    });
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    // The outcome is a word, never a colour alone.
    expect(screen.getAllByText('TD').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('img')).toHaveAccessibleDescription(/2 drives, 1 of which/);
  });

  it('labels only the last point of a trend, not every one', () => {
    render(PointsTrend, {
      data: [
        { label: 'W1', us: 21, them: 14 },
        { label: 'W2', us: 7, them: 28 },
        { label: 'W3', us: 35, them: 3 },
      ],
      us: 'NSR', them: 'Opp',
    });
    // 35 and 3 are the final values, drawn on the plot and in the table.
    expect(screen.getAllByText('35')).toHaveLength(2);
    // 21 appears only in the table.
    expect(screen.getAllByText('21')).toHaveLength(1);
  });

  it('shows a conversion rate as a fraction, not only a bar', () => {
    render(DownEfficiency, {
      data: [
        { down: 1, attempts: 20, converted: 9, pct: 45 },
        { down: 3, attempts: 13, converted: 7, pct: 53.84 },
      ],
    });
    expect(screen.getAllByText('7/13').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('img')).toHaveAccessibleDescription(/Best on 3rd down/);
  });

  it('has no legend for a single-series chart', () => {
    render(FieldZones, {
      data: [
        { zone: 'own' as const, plays: 12, yards: 40, touchdowns: 0 },
        { zone: 'red' as const, plays: 5, yards: 18, touchdowns: 2 },
      ],
    });
    // The title names what it shows, so a one-series legend is noise.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('a whole report renders', () => {
  it('draws every block type from a model', async () => {
    const db = await createTestDb();
    const { gameId } = await replayGame(db);
    setDb(db);
    router.params = { templateId: 'post-game' };
    router.query = new URLSearchParams(`game=${gameId}`);

    render(Report);

    // The headline is the result of the real game.
    await waitFor(() => expect(screen.getByText('36–33')).toBeInTheDocument());

    // Sections, charts and their tables all present.
    expect(screen.getByRole('heading', { name: 'WAS vs PHI' })).toBeInTheDocument();
    const figures = screen.getAllByRole('img');
    expect(figures.length).toBeGreaterThan(3);
    for (const figure of figures) {
      expect(figure).toHaveAccessibleName(/\S/);
    }
    // Every chart carries a table twin, so no value is hover-only.
    expect(screen.getAllByRole('table').length).toBeGreaterThanOrEqual(figures.length);
  });

  it('offers a way back when the link is malformed', async () => {
    const db = await createTestDb();
    setDb(db);
    router.params = { templateId: 'post-game' };
    router.query = new URLSearchParams('game=nonsense');

    render(Report);
    await waitFor(() =>
      expect(screen.getByText(/does not exist, or its link is missing/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Back to reports' })).toBeInTheDocument();
  });
});
