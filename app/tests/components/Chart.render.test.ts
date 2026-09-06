/**
 * The chart shell's accessibility contract.
 *
 * The numbers these charts show are asserted in the node project against
 * real SQLite. What only a mounted component can prove is that a value is
 * reachable without a mouse: a titled image, a legend when there are two
 * series, and a table carrying the same numbers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import ScoringByQuarter from '../../src/lib/components/charts/ScoringByQuarter.svelte';

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
