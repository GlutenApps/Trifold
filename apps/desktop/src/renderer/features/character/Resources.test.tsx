import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Sheet } from '@trifold/schema';
import { Pips, ResourcesSection } from './Resources';

/** Resources on a Trifold sheet (ADR 0074), drawn as pips (ADR 0080). */

const start: Sheet = {
  ...blankSheet(),
  classes: [{ name: 'Cleric', subclass: '', level: 3 }],
  abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
  slots: [4, 2],
  features: [
    {
      id: 'f1',
      name: 'Channel Divinity',
      from: 'Cleric',
      text: '',
      uses: { max: 2, used: 0, reset: 'short' },
    },
  ],
};

/** The section with the sheet kept in state, as the character store keeps it. */
function Harness({ onHeal, seen }: { onHeal?(n: number): void; seen(s: Sheet): void }) {
  const [sheet, setSheet] = useState(start);
  return (
    <ResourcesSection
      sheet={sheet}
      edition="2024"
      onChange={(next) => {
        setSheet(next);
        seen(next);
      }}
      {...(onHeal ? { onHeal } : {})}
    />
  );
}

describe('Resources', () => {
  it('spends slots and uses with their pips, and gives one back', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<Harness seen={seen} />);
    // A filled pip is one left: pressing it spends one; pressing a hollow one gives one back.
    await user.click(screen.getByRole('button', { name: 'Level 1 slot 1, available' }));
    await user.click(screen.getByRole('button', { name: 'Level 1 slot 2, available' }));
    expect(screen.getByRole('group', { name: 'Level 1 slot: 2 of 4 left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level 1 slot 4, used' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Level 1 slot 4, used' }));
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([1]);
    await user.click(screen.getByRole('button', { name: 'Channel Divinity use 1, available' }));
    expect(seen.mock.lastCall![0].features[0].uses.used).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Heroic Inspiration 1, used' }));
    expect(seen.mock.lastCall![0].inspiration).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Hit die d8 1, available' }));
    expect(seen.mock.lastCall![0].hitDiceUsed).toEqual({ 8: 1 });
  });

  it('rests, says what came back, and undoes it; a long rest asks first', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<Harness seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Channel Divinity use 1, available' }));
    await user.click(screen.getByRole('button', { name: 'Level 1 slot 1, available' }));
    await user.click(screen.getByRole('button', { name: 'Short rest' }));
    expect(screen.getByTestId('resources-said')).toHaveTextContent(
      'Short rest: Channel Divinity back.',
    );
    // Slots are not Pact Magic here: they wait for a long rest.
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([1]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(seen.mock.lastCall![0].features[0].uses.used).toBe(1);

    // Long rest asks, and Keep (or Escape) leaves everything as it was.
    const calls = seen.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Long rest' }));
    const ask = screen.getByRole('group', { name: 'Take a long rest?' });
    expect(within(ask).getByRole('button', { name: 'Keep' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Take a long rest?' })).toBeNull();
    expect(seen.mock.calls.length).toBe(calls);
    await user.click(screen.getByRole('button', { name: 'Long rest' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Take a long rest?' })).getByRole('button', {
        name: 'Long rest',
      }),
    );
    expect(screen.getByTestId('resources-said')).toHaveTextContent(
      'Long rest: Channel Divinity, spell slots back.',
    );
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([]);
  });

  it('spends a hit die: sends the healing at the table, or says the total away from it', async () => {
    const onHeal = vi.fn();
    const seen = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Harness seen={seen} onHeal={onHeal} />);
    expect(screen.getByText('3 of 3 d8 left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Spend a d8' }));
    expect(screen.getByText('2 of 3 d8 left')).toBeInTheDocument();
    const healed = onHeal.mock.lastCall![0] as number;
    // A d8 plus Con +2.
    expect(healed).toBeGreaterThanOrEqual(3);
    expect(healed).toBeLessThanOrEqual(10);
    expect(screen.getByTestId('resources-said')).toHaveTextContent('sent to the table');
    unmount();
    render(<Harness seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Spend a d8' }));
    expect(screen.getByTestId('resources-said')).toHaveTextContent('add it to your hit points');
  });

  it('draws inert pips for a sheet that only reads', () => {
    render(<Pips label="Level 1 slot" max={3} used={1} />);
    expect(screen.getByRole('group', { name: 'Level 1 slot: 2 of 3 left' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
