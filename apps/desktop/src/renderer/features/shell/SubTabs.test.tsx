import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitTabs, SubTabs, type SubTab } from './SubTabs';

/** Sub-tabs that fold into More instead of scrolling (ADR 0042). */
const TABS: SubTab<string>[] = [
  { id: 'monster', label: 'Monsters' },
  { id: 'spell', label: 'Spells' },
  { id: 'condition', label: 'Conditions' },
  { id: 'rule', label: 'Rules' },
  { id: 'item', label: 'Items' },
  { id: 'class', label: 'Classes' },
];
const WIDTHS = [100, 80, 110, 70, 70, 90];

describe('fitTabs', () => {
  it('shows every tab when they fit', () => {
    expect(fitTabs(TABS, WIDTHS, 520, 70, 'monster')).toHaveLength(6);
  });

  it('folds from the end of the order, keeping room for More', () => {
    // 400 wide less 70 for More: Monsters, Spells, Conditions fit (290); Rules would be 360.
    expect(fitTabs(TABS, WIDTHS, 400, 70, 'monster')).toEqual(['monster', 'spell', 'condition']);
  });

  it('always shows the open tab, making room for it before later ones', () => {
    expect(fitTabs(TABS, WIDTHS, 400, 70, 'class')).toEqual(['monster', 'spell', 'class']);
    // Never a later narrow tab after an earlier one folded: the order holds.
    expect(fitTabs(TABS, [100, 300, 50, 50, 50, 50], 300, 70, 'monster')).toEqual(['monster']);
  });
});

describe('SubTabs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('puts the tabs that do not fit in More, and picks one from there', async () => {
    // A narrow bar and wide labels: only the first two tabs fit beside More.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(260);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(80);
    const onSelect = vi.fn();
    render(<SubTabs label="Record kind" tabs={TABS} active="monster" onSelect={onSelect} />);
    const list = screen.getByRole('tablist', { name: 'Record kind' });
    expect(
      within(list)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Monsters', 'Spells']);
    await userEvent.click(screen.getByRole('button', { name: /^More:/ }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Conditions', 'Rules', 'Items', 'Classes']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Rules' }));
    expect(onSelect).toHaveBeenCalledWith('rule');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
