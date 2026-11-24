import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRollLogStore } from '../../stores/rollLogStore';
import { useTableRollStore } from '../../stores/tableRollStore';
import { d20, damageDice, rollFromSheet } from './sheetRolls';

/** Rolling from the sheet (ADR 0075). */

beforeEach(() => {
  useRollLogStore.getState().clear();
  useTableRollStore.setState({ mode: 'table', send: null });
});

describe('sheet roll expressions', () => {
  it('writes a d20 test and finds the dice in a damage line', () => {
    expect(d20(5)).toBe('1d20+5');
    expect(d20(-1)).toBe('1d20-1');
    expect(d20(0)).toBe('1d20');
    expect(damageDice('1d8+3 slashing')).toBe('1d8+3');
    expect(damageDice('2d6 + 2 fire')).toBe('2d6+2');
    expect(damageDice('special')).toBeNull();
  });
});

describe('rollFromSheet', () => {
  it('rolls here when not at the table, named for what it was, and hands back initiative', () => {
    const onInitiative = vi.fn();
    expect(
      rollFromSheet('Initiative', '1d20+2', { actor: 'Bren', mode: 'advantage', onInitiative }),
    ).toBeNull();
    const [entry] = useRollLogStore.getState().entries;
    expect(entry).toMatchObject({ label: 'Initiative: 1d20+2 (advantage)', actor: 'Bren' });
    expect(onInitiative).toHaveBeenCalledWith(entry!.total);
  });

  it('asks the table with Table chosen, saying what it is for and whose initiative', () => {
    const send = vi.fn();
    useTableRollStore.setState({ mode: 'table', send });
    const onInitiative = vi.fn();
    rollFromSheet('Initiative', '1d20+2', {
      actor: 'Bren',
      mode: 'disadvantage',
      initiative: { creatureKind: 'pc', creatureId: 'p1' },
      onInitiative,
    });
    expect(send).toHaveBeenCalledWith('1d20+2 dis', {
      for: 'Initiative',
      initiative: { creatureKind: 'pc', creatureId: 'p1' },
    });
    // The GM's Trifold enters it; nothing is rolled or sent here.
    expect(onInitiative).not.toHaveBeenCalled();
    expect(useRollLogStore.getState().entries).toEqual([]);
  });

  it('rolls here with Private chosen, at the table or not', () => {
    const send = vi.fn();
    useTableRollStore.setState({ mode: 'private', send });
    rollFromSheet('Longsword damage', '1d8+3', { actor: 'Bren', mode: 'advantage' });
    expect(send).not.toHaveBeenCalled();
    // Advantage is for a lone d20, not damage.
    expect(useRollLogStore.getState().entries[0]!.label).toBe('Longsword damage: 1d8+3');
  });
});
