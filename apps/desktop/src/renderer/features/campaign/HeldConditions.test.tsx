import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeldConditions } from './HeldConditions';

/** A PC card's or NPC's conditions between fights, on its Campaign row (ADR 0049, ADR 0055). */
describe('HeldConditions', () => {
  it('adds a condition from the plus menu, raises Exhaustion a level, and removes one', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HeldConditions name="Brannoc" conditions={undefined} onChange={onChange} />,
    );
    // No dropdown on the row: the plus opens the list.
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a condition to Brannoc' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exhaustion' }));
    const first = onChange.mock.calls[0]![0];
    expect(first).toMatchObject([{ name: 'Exhaustion', level: 1 }]);
    expect(screen.queryByRole('menu')).toBeNull();

    rerender(<HeldConditions name="Brannoc" conditions={first} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Brannoc conditions' })).toHaveTextContent(
      'Exhaustion 1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add a condition to Brannoc' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exhaustion (to level 2)' }));
    expect(onChange.mock.calls[1]![0]).toMatchObject([{ name: 'Exhaustion', level: 2 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Exhaustion from Brannoc' }));
    expect(onChange.mock.calls[2]![0]).toEqual([]);
  });

  it('closes the menu on Escape without adding anything', () => {
    const onChange = vi.fn();
    render(<HeldConditions name="Wren" conditions={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a condition to Wren' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
