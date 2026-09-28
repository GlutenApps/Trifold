import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_COUNTS,
  poolExpression,
  poolIsSingleD20,
  poolLabel,
  useDicePoolStore,
} from './dicePoolStore';
import { useRollLogStore } from './rollLogStore';

describe('poolExpression', () => {
  it('lists dice largest first with the modifier last', () => {
    expect(
      poolExpression({ counts: { ...EMPTY_COUNTS, 6: 2, 8: 1 }, modifier: 3, mode: 'normal' }),
    ).toBe('1d8+2d6+3');
    expect(
      poolExpression({ counts: { ...EMPTY_COUNTS, 20: 1 }, modifier: -2, mode: 'normal' }),
    ).toBe('1d20-2');
  });

  it('treats a bare modifier as a d20 and an empty pool as nothing', () => {
    expect(poolExpression({ counts: { ...EMPTY_COUNTS }, modifier: 5, mode: 'normal' })).toBe(
      '1d20+5',
    );
    expect(poolExpression({ counts: { ...EMPTY_COUNTS }, modifier: 0, mode: 'normal' })).toBeNull();
  });

  it('labels the mode only for a lone d20', () => {
    const lone = { counts: { ...EMPTY_COUNTS, 20: 1 }, modifier: 4, mode: 'advantage' as const };
    expect(poolIsSingleD20(lone)).toBe(true);
    expect(poolLabel(lone)).toBe('1d20 + 4 (advantage)');
    const mixed = { ...lone, counts: { ...lone.counts, 6: 1 } };
    expect(poolIsSingleD20(mixed)).toBe(false);
    expect(poolLabel(mixed)).toBe('1d20 + 1d6 + 4');
  });
});

describe('useDicePoolStore', () => {
  beforeEach(() => {
    useDicePoolStore.getState().clear();
    useRollLogStore.getState().clear();
  });

  it('accumulates clicks, rolls into the shared log and keeps the pool', () => {
    const pool = useDicePoolStore.getState();
    pool.add(6);
    pool.add(6);
    pool.add(4);
    pool.bumpModifier(1);
    expect(poolExpression(useDicePoolStore.getState())).toBe('2d6+1d4+1');
    const total = useDicePoolStore.getState().roll();
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(17);
    const entry = useRollLogStore.getState().entries[0]!;
    expect(entry.label).toBe('2d6+1d4+1');
    expect(entry.total).toBe(total);
    expect(poolExpression(useDicePoolStore.getState())).toBe('2d6+1d4+1');
  });

  it('removes one die at a time and never goes negative', () => {
    const pool = useDicePoolStore.getState();
    pool.add(8);
    pool.remove(8);
    pool.remove(8);
    expect(useDicePoolStore.getState().counts[8]).toBe(0);
    expect(useDicePoolStore.getState().roll()).toBeNull();
  });

  it('applies advantage to a lone d20 and ignores it otherwise', () => {
    const pool = useDicePoolStore.getState();
    pool.add(20);
    pool.setMode('advantage');
    pool.roll();
    expect(useRollLogStore.getState().entries[0]!.label).toBe('1d20 (advantage)');
    pool.add(6);
    pool.roll();
    expect(useRollLogStore.getState().entries[0]!.label).toBe('1d20+1d6');
  });
});
