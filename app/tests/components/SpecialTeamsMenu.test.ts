/**
 * SpecialTeamsMenu renders different buttons depending on the situation prop.
 *
 * Six situations are covered:
 *   - 'kickoff'       → only Kickoff button
 *   - 'extra_point'   → only PAT / 2pt button
 *   - 'normal'        → Punt + Field Goal (default branch)
 *   - 'turnover'      → Punt + Field Goal (default branch)
 *   - 'turnover_on_downs' → Punt + Field Goal (default branch)
 *   - 'opponent_ball'     → Punt + Field Goal (default branch)
 *
 * Click handlers are verified for each rendered button and for Back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import SpecialTeamsMenu from '../../src/lib/components/tracker/SpecialTeamsMenu.svelte';
import type { Situation } from '../../src/lib/game/nextState';

afterEach(() => {
  cleanup();
});

function mount(situation: Situation) {
  const onselect = vi.fn();
  const onback = vi.fn();
  render(SpecialTeamsMenu, { props: { onselect, onback, situation } });
  return { onselect, onback };
}

describe('SpecialTeamsMenu', () => {
  it('shows only Kickoff when situation is kickoff', async () => {
    const { onselect, onback } = mount('kickoff');

    expect(screen.getByRole('button', { name: 'Kickoff' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Punt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Field Goal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAT / 2pt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '‹ Back' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Kickoff' }));
    expect(onselect).toHaveBeenCalledWith('kickoff');
    expect(onselect).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    expect(onback).toHaveBeenCalledTimes(1);
  });

  it('shows only PAT / 2pt when situation is extra_point', async () => {
    const { onselect, onback } = mount('extra_point');

    expect(screen.getByRole('button', { name: 'PAT / 2pt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kickoff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Punt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Field Goal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '‹ Back' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'PAT / 2pt' }));
    expect(onselect).toHaveBeenCalledWith('extra_point');
    expect(onselect).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    expect(onback).toHaveBeenCalledTimes(1);
  });

  it('shows Punt and Field Goal when situation is normal', async () => {
    const { onselect, onback } = mount('normal');

    expect(screen.getByRole('button', { name: 'Punt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Field Goal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kickoff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAT / 2pt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '‹ Back' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Punt' }));
    expect(onselect).toHaveBeenCalledWith('punt');

    await userEvent.click(screen.getByRole('button', { name: 'Field Goal' }));
    expect(onselect).toHaveBeenCalledWith('field_goal');

    await userEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    expect(onback).toHaveBeenCalledTimes(1);
  });

  it('shows Punt and Field Goal when situation is turnover', async () => {
    const { onselect } = mount('turnover');

    expect(screen.getByRole('button', { name: 'Punt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Field Goal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kickoff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAT / 2pt' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Punt' }));
    expect(onselect).toHaveBeenCalledWith('punt');

    await userEvent.click(screen.getByRole('button', { name: 'Field Goal' }));
    expect(onselect).toHaveBeenCalledWith('field_goal');
  });

  it('shows Punt and Field Goal when situation is turnover_on_downs', async () => {
    const { onselect } = mount('turnover_on_downs');

    expect(screen.getByRole('button', { name: 'Punt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Field Goal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kickoff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAT / 2pt' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Punt' }));
    expect(onselect).toHaveBeenCalledWith('punt');

    await userEvent.click(screen.getByRole('button', { name: 'Field Goal' }));
    expect(onselect).toHaveBeenCalledWith('field_goal');
  });

  it('shows Punt and Field Goal when situation is opponent_ball', async () => {
    const { onselect } = mount('opponent_ball');

    expect(screen.getByRole('button', { name: 'Punt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Field Goal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kickoff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAT / 2pt' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Punt' }));
    expect(onselect).toHaveBeenCalledWith('punt');

    await userEvent.click(screen.getByRole('button', { name: 'Field Goal' }));
    expect(onselect).toHaveBeenCalledWith('field_goal');
  });

  it('calls onback when Back is clicked regardless of situation', async () => {
    for (const situation of ['kickoff', 'extra_point', 'normal', 'turnover', 'turnover_on_downs', 'opponent_ball'] as Situation[]) {
      const onback = vi.fn();
      render(SpecialTeamsMenu, { props: { onselect: vi.fn(), onback, situation } });
      await userEvent.click(screen.getByRole('button', { name: '‹ Back' }));
      expect(onback).toHaveBeenCalledTimes(1);
      onback.mockClear();
      cleanup();
    }
  });

  it('does not call onselect when Back is clicked', async () => {
    const onselect = vi.fn();
    const onback = vi.fn();
    render(SpecialTeamsMenu, { props: { onselect, onback, situation: 'normal' } });

    await userEvent.click(screen.getByRole('button', { name: '‹ Back' }));
    expect(onselect).not.toHaveBeenCalled();
    expect(onback).toHaveBeenCalledTimes(1);
  });
});
