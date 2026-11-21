import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeldConditions } from './HeldConditions';

/** A PC card's or NPC's conditions between fights, on its Campaign row (ADR 0049). */
describe('HeldConditions', () => {
  it('adds a condition, raises Exhaustion a level, and removes one', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HeldConditions name="Brannoc" conditions={undefined} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText('Add a condition to Brannoc'), {
      target: { value: 'Exhaustion' },
    });
    const first = onChange.mock.calls[0]![0];
    expect(first).toMatchObject([{ name: 'Exhaustion', level: 1 }]);

    rerender(<HeldConditions name="Brannoc" conditions={first} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Brannoc conditions' })).toHaveTextContent(
      'Exhaustion 1',
    );
    fireEvent.change(screen.getByLabelText('Add a condition to Brannoc'), {
      target: { value: 'Exhaustion' },
    });
    expect(onChange.mock.calls[1]![0]).toMatchObject([{ name: 'Exhaustion', level: 2 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Exhaustion from Brannoc' }));
    expect(onChange.mock.calls[2]![0]).toEqual([]);
  });
});
