import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Sheet } from '@trifold/schema';
import { ResourcesSection } from './Resources';

/** Resources on a Trifold sheet (ADR 0074). */

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
  it('spends slots and uses with their boxes, and gives one back', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<Harness seen={seen} />);
    await user.click(screen.getByRole('checkbox', { name: 'Level 1 slot 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Level 1 slot 2' }));
    expect(screen.getByRole('group', { name: 'Level 1 slot: 2 of 4 used' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Level 1 slot 2' }));
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([1]);
    await user.click(screen.getByRole('checkbox', { name: 'Channel Divinity 1' }));
    expect(seen.mock.lastCall![0].features[0].uses.used).toBe(1);
    await user.click(screen.getByRole('checkbox', { name: 'Heroic Inspiration' }));
    expect(seen.mock.lastCall![0].inspiration).toBe(true);
  });

  it('rests, says what came back, and undoes it', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<Harness seen={seen} />);
    await user.click(screen.getByRole('checkbox', { name: 'Channel Divinity 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Level 1 slot 1' }));
    await user.click(screen.getByRole('button', { name: 'Short rest' }));
    expect(screen.getByTestId('resources-said')).toHaveTextContent(
      'Short rest: Channel Divinity back.',
    );
    // Slots are not Pact Magic here: they wait for a long rest.
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([1]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(seen.mock.lastCall![0].features[0].uses.used).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Long rest' }));
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
    expect(screen.getByText('Hit dice: 3 of 3 d8 left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Spend a d8' }));
    expect(screen.getByText('Hit dice: 2 of 3 d8 left')).toBeInTheDocument();
    const healed = onHeal.mock.lastCall![0] as number;
    // A d8 plus Con +2.
    expect(healed).toBeGreaterThanOrEqual(3);
    expect(healed).toBeLessThanOrEqual(10);
    expect(screen.getByTestId('resources-said')).toHaveTextContent('sent to the table');
    unmount();
    render(<Harness seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Spend a d8' }));
    expect(screen.getByTestId('resources-said')).toHaveTextContent('Add it to your hit points.');
  });
});
