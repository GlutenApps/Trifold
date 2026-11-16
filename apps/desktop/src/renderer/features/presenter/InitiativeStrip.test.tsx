import { render, screen, within } from '@testing-library/react';
import type { CombatSummary } from '@trifold/api';
import { describe, expect, it } from 'vitest';
import { fromActive, InitiativeStrip, stripSize } from './InitiativeStrip';

const entry = (id: string): CombatSummary['entries'][number] => ({
  id,
  name: id,
  role: 'enemy',
  isPc: false,
  dead: false,
  bloodied: false,
});

describe('InitiativeStrip', () => {
  it('runs from whoever’s turn it is, round the order', () => {
    const order = ['a', 'b', 'c', 'd'].map(entry);
    expect(fromActive(order, 'c').map((e) => e.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(fromActive(order, null).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shrinks the chips as the fight grows', () => {
    expect(stripSize(6)).toBe('l');
    expect(stripSize(7)).toBe('m');
    expect(stripSize(11)).toBe('s');
  });

  it('puts the active creature first, with the "+N" chip out of the way while all fit', () => {
    const combat: CombatSummary = {
      round: 1,
      activeId: 'Goblin 2',
      entries: ['Brannoc', 'Goblin 1', 'Goblin 2'].map(entry),
    };
    render(<InitiativeStrip combat={combat} healthBars={false} />);
    const strip = screen.getByRole('list', { name: 'Initiative' });
    const chips = within(strip).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual(['Goblin 2', 'Brannoc', 'Goblin 1']);
    expect(chips[0]).toHaveClass('active');
    expect(screen.getByTestId('initiative-more')).toHaveClass('folded');
  });
});
