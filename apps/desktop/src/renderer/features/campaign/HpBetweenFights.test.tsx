import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { changeHp, HpChip, HpEditor, hpText } from './HpBetweenFights';

/** HP between fights (ADR 0055): the tracker's rules, from a Campaign row. */
describe('changeHp', () => {
  const hp = { current: 20, max: 31, temp: 5 };

  it('takes damage off temp HP first and stops at 0', () => {
    expect(changeHp(hp, 'damage', 8)).toEqual({ current: 17, max: 31, temp: 0 });
    expect(changeHp(hp, 'damage', 100)).toEqual({ current: 0, max: 31, temp: 0 });
  });

  it('heals up to max, sets temp HP without stacking, and sets current HP', () => {
    expect(changeHp(hp, 'heal', 50)).toEqual({ current: 31, max: 31, temp: 5 });
    expect(changeHp(hp, 'temp', 3)).toEqual({ current: 20, max: 31, temp: 3 });
    expect(changeHp(hp, 'set', 12)).toEqual({ current: 12, max: 31, temp: 5 });
    expect(changeHp(hp, 'set', 99)).toEqual({ current: 31, max: 31, temp: 5 });
  });
});

describe('HpChip and HpEditor', () => {
  it('shows carried HP, or full when nothing is carried', () => {
    expect(hpText({ current: 26, max: 31, temp: 100 })).toBe('HP 26/31 +100');
    expect(hpText(null)).toBe('HP full');
    const onToggle = vi.fn();
    render(
      <HpChip
        name="Brannoc"
        hp={{ current: 26, max: 31, temp: 0 }}
        open={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Change Brannoc's HP" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('applies an amount as damage, heal, temp HP or set, and closes on Escape', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <HpEditor
        name="Ilyra"
        hp={{ current: 15, max: 20, temp: 0 }}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    const amount = screen.getByRole('spinbutton', { name: 'Amount for Ilyra' });
    expect(amount).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Damage' })).toBeDisabled();
    fireEvent.change(amount, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Damage' }));
    expect(onApply).toHaveBeenLastCalledWith({ current: 11, max: 20, temp: 0 });
    fireEvent.change(amount, { target: { value: '3' } });
    fireEvent.keyDown(amount, { key: 'Enter', shiftKey: true });
    expect(onApply).toHaveBeenLastCalledWith({ current: 18, max: 20, temp: 0 });
    fireEvent.change(amount, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Temp HP' }));
    expect(onApply).toHaveBeenLastCalledWith({ current: 15, max: 20, temp: 6 });
    fireEvent.keyDown(amount, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
