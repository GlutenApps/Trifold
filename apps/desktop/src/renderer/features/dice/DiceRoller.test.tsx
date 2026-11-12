import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePinnedRollsStore } from '../../stores/pinnedRollsStore';
import { useRollLogStore } from '../../stores/rollLogStore';
import { DiceRoller } from './DiceRoller';
import { REVEAL_MS } from './RollReveal';

function log(label: string, total: number) {
  useRollLogStore.getState().add({
    kind: 'dice',
    label,
    expression: label,
    total,
    faces: `${label}: ${total}`,
    source: 'pool',
  });
}

describe('DiceRoller: the roll log', () => {
  beforeEach(() => useRollLogStore.getState().clear());

  it('lists rolls oldest first, with the newest marked at the bottom', () => {
    log('1d4', 3);
    log('1d8', 7);
    log('1d12', 11);
    render(<DiceRoller />);
    const rows = within(screen.getByRole('list', { name: 'Roll log' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('1d4'),
      expect.stringContaining('1d8'),
      expect.stringContaining('1d12'),
    ]);
    expect(rows[2]).toBe(screen.getByTestId('latest-roll'));
    // The top-of-panel result is gone: the reveal lives only on the newest log row.
    expect(screen.getAllByTestId('roll-reveal')).toHaveLength(1);
  });

  it('does not replay the reveal when the panel opens on an older roll', () => {
    log('1d20', 15);
    const [entry] = useRollLogStore.getState().entries;
    useRollLogStore.setState({ entries: [{ ...entry!, at: Date.now() - REVEAL_MS - 1 }] });
    render(<DiceRoller />);
    const reveal = within(screen.getByTestId('latest-roll')).getByTestId('roll-reveal');
    expect(reveal).toHaveAttribute('data-settled', 'true');
    expect(reveal).toHaveTextContent('15');
  });
});

describe('DiceRoller: pinned rolls', () => {
  beforeEach(() => {
    useRollLogStore.getState().clear();
    usePinnedRollsStore.setState({ fromLog: {}, naming: null, error: null });
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', slug: 'keep', settings: {} },
        pinnedRolls: [],
      } as unknown as CampaignBundle,
    });
    vi.mocked(window.trifold.pinnedRolls.save).mockClear();
    vi.mocked(window.trifold.pinnedRolls.remove).mockClear();
  });

  it('pins a roll from the log, opens its name, and keeps the name typed', async () => {
    log('4d6kh3', 15);
    render(<DiceRoller />);
    await userEvent.click(screen.getByRole('button', { name: 'Pin 4d6kh3' }));

    const pinned = await screen.findByRole('list', { name: 'Pinned rolls' });
    const name = within(pinned).getByRole('textbox', { name: 'Name for the pinned 4d6kh3 roll' });
    expect(name).toHaveFocus();
    expect(name).toHaveValue('4d6kh3');
    await userEvent.clear(name);
    await userEvent.type(name, "Kael's strength{Enter}");

    expect(within(pinned).getByText("Kael's strength")).toBeInTheDocument();
    expect(within(pinned).getByText('4d6kh3 · 4d6kh3: 15')).toBeInTheDocument();
    expect(window.trifold.pinnedRolls.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Kael's strength", total: 15, faces: '4d6kh3: 15' }),
    );
    // The log row shows it is pinned.
    expect(screen.getByRole('button', { name: 'Pin 4d6kh3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Clearing the log leaves the pin.
    await userEvent.click(screen.getByRole('button', { name: 'Clear roll log' }));
    expect(screen.getAllByTestId('pinned-roll')).toHaveLength(1);
  });

  it('unpins after the inline confirm', async () => {
    log('1d20', 20);
    render(<DiceRoller />);
    await userEvent.click(screen.getByRole('button', { name: 'Pin 1d20' }));
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Unpin 1d20' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getAllByTestId('pinned-roll')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Unpin 1d20' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Unpin 1d20?' })).getByRole('button', {
        name: 'Unpin',
      }),
    );
    expect(window.trifold.pinnedRolls.remove).toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Pinned rolls' })).not.toBeInTheDocument();
  });

  it('needs an open campaign to pin', () => {
    useCampaignStore.setState({ current: null });
    log('1d6', 4);
    render(<DiceRoller />);
    expect(screen.getByRole('button', { name: 'Pin 1d6' })).toBeDisabled();
  });
});
