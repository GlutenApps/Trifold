import { describe, expect, it } from 'vitest';
import {
  adjustCounter,
  applyCounterFields,
  bigStep,
  canAdjust,
  canShowOnTv,
  clampCounterValue,
  counterBound,
  draftOf,
  EMPTY_COUNTER_DRAFT,
  MAX_TV_COUNTERS,
  moveCounter,
  nextCounterOrder,
  parseCounterDraft,
  parseWhole,
  setCounterValue,
  sortCounters,
  tvCounters,
  type CounterLike,
} from './counters';

const counter = (over: Partial<CounterLike> = {}): CounterLike => ({
  id: 'c1',
  name: 'Torches',
  initial: 3,
  value: 3,
  step: 5,
  order: 0,
  ...over,
});

describe('clamping', () => {
  it('holds a value inside the bounds that are set', () => {
    expect(clampCounterValue(12, { min: 0, max: 10 })).toBe(10);
    expect(clampCounterValue(-4, { min: 0, max: 10 })).toBe(0);
    expect(clampCounterValue(-4, {})).toBe(-4);
    expect(clampCounterValue(99, { min: 0 })).toBe(99);
    expect(clampCounterValue(-99, { max: 3 })).toBe(-99);
  });

  it('knows which bound a counter sits on', () => {
    expect(counterBound({ value: 0, min: 0, max: 3 })).toBe('min');
    expect(counterBound({ value: 3, min: 0, max: 3 })).toBe('max');
    expect(counterBound({ value: 2, min: 0, max: 3 })).toBeNull();
    expect(counterBound({ value: 2 })).toBeNull();
  });
});

describe('adjusting', () => {
  it('adds and takes away freely with no bounds', () => {
    expect(adjustCounter(counter(), 5)).toEqual({ value: 8, hit: null });
    expect(adjustCounter(counter(), -10)).toEqual({ value: -7, hit: null });
  });

  it('stops at the maximum and says so, whether landing on it or pushing past', () => {
    const c = counter({ value: 2, max: 3 });
    expect(adjustCounter(c, 1)).toEqual({ value: 3, hit: 'max' });
    expect(adjustCounter(c, 5)).toEqual({ value: 3, hit: 'max' });
    expect(adjustCounter({ ...c, value: 3 }, 1)).toEqual({ value: 3, hit: 'max' });
  });

  it('stops at the minimum the same way', () => {
    const c = counter({ value: 2, min: 0 });
    expect(adjustCounter(c, -5)).toEqual({ value: 0, hit: 'min' });
    expect(adjustCounter({ ...c, value: 0 }, -1)).toEqual({ value: 0, hit: 'min' });
  });

  it('moving away from a bound hits nothing', () => {
    expect(adjustCounter(counter({ value: 0, min: 0, max: 3 }), 1)).toEqual({
      value: 1,
      hit: null,
    });
  });

  it('a typed value is clamped; typing the same value hits nothing', () => {
    const c = counter({ value: 2, min: 0, max: 10 });
    expect(setCounterValue(c, 40)).toEqual({ value: 10, hit: 'max' });
    expect(setCounterValue(c, -3)).toEqual({ value: 0, hit: 'min' });
    expect(setCounterValue(c, 7)).toEqual({ value: 7, hit: null });
    expect(setCounterValue({ ...c, value: 10 }, 10)).toEqual({ value: 10, hit: null });
  });

  it('says whether a direction can still move', () => {
    const c = counter({ value: 3, min: 0, max: 3 });
    expect(canAdjust(c, 1)).toBe(false);
    expect(canAdjust(c, -1)).toBe(true);
    expect(canAdjust({ ...c, value: 0 }, -1)).toBe(false);
    expect(canAdjust(counter(), 1)).toBe(true);
  });
});

describe('the form', () => {
  it('reads whole numbers, including a typographic minus', () => {
    expect(parseWhole(' 12 ')).toBe(12);
    expect(parseWhole('-3')).toBe(-3);
    expect(parseWhole('−3')).toBe(-3);
    expect(parseWhole('2.5')).toBeNull();
    expect(parseWhole('abc')).toBeNull();
    expect(parseWhole('')).toBeNull();
  });

  it('accepts a name alone, with initial 0, step 1 and no alternate step', () => {
    expect(parseCounterDraft({ ...EMPTY_COUNTER_DRAFT, name: '  Ritual   rounds ' })).toEqual({
      ok: true,
      fields: { name: 'Ritual rounds', initial: 0, step: 1 },
    });
  });

  it('keeps bounds and an alternate step when set; a blank step means 1', () => {
    expect(
      parseCounterDraft({ name: 'LR', initial: '3', min: '0', max: '3', step: '', altStep: '5' }),
    ).toEqual({
      ok: true,
      fields: { name: 'LR', initial: 3, min: 0, max: 3, step: 1, altStep: 5 },
    });
  });

  it('refuses a missing name, bad numbers, min above max and steps under 1', () => {
    const r = parseCounterDraft({
      name: ' ',
      initial: 'x',
      min: '5',
      max: '2',
      step: '0',
      altStep: '-2',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['altStep', 'initial', 'max', 'name', 'step']);
  });

  it('refuses an initial value outside the bounds', () => {
    const base = { name: 'A', step: '1', altStep: '' };
    const below = parseCounterDraft({ ...base, initial: '-1', min: '0', max: '' });
    const above = parseCounterDraft({ ...base, initial: '9', min: '', max: '4' });
    expect(below).toEqual({ ok: false, errors: { initial: 'At least the minimum' } });
    expect(above).toEqual({ ok: false, errors: { initial: 'At most the maximum' } });
  });

  it('round-trips a counter through its draft', () => {
    const c = counter({ min: 0, max: 6, step: 2, altStep: 10 });
    expect(parseCounterDraft(draftOf(c))).toEqual({
      ok: true,
      fields: { name: 'Torches', initial: 3, min: 0, max: 6, step: 2, altStep: 10 },
    });
    expect(draftOf(counter())).toMatchObject({ min: '', altStep: '' });
  });

  it('an edit keeps the value but pulls it inside new bounds, and can drop the alternate step', () => {
    const c = counter({ value: 9, altStep: 5 });
    expect(applyCounterFields(c, { name: 'T', initial: 3, step: 5, altStep: 5 }).value).toBe(9);
    const bounded = applyCounterFields(c, { name: 'T', initial: 3, min: 0, max: 4, step: 1 });
    expect(bounded).toMatchObject({ name: 'T', value: 4, min: 0, max: 4, step: 1 });
    expect('altStep' in bounded).toBe(false);
    const cleared = applyCounterFields(bounded, { name: 'T', initial: 3, step: 1 });
    expect('min' in cleared || 'max' in cleared).toBe(false);
  });

  it('uses the alternate step for big moves, else the main step', () => {
    expect(bigStep({ step: 1, altStep: 5 })).toBe(5);
    expect(bigStep({ step: 2 })).toBe(2);
  });
});

describe('the TV', () => {
  it('shows the first three marked counters in list order, with max and bound', () => {
    const list = [
      counter({ id: 'a', name: 'A', order: 3, showOnTv: true }),
      counter({ id: 'b', name: 'B', order: 0, showOnTv: true, value: 3, max: 3 }),
      counter({ id: 'c', name: 'C', order: 1 }),
      counter({ id: 'd', name: 'D', order: 2, showOnTv: true, value: 0, min: 0 }),
      counter({ id: 'e', name: 'E', order: 4, showOnTv: true }),
    ];
    expect(tvCounters(list)).toEqual([
      { id: 'b', name: 'B', value: 3, max: 3, bound: 'max' },
      { id: 'd', name: 'D', value: 0, bound: 'min' },
      { id: 'a', name: 'A', value: 3, bound: null },
    ]);
    expect(MAX_TV_COUNTERS).toBe(3);
  });

  it('lets a counter on the TV come off, and a new one on only while there is room', () => {
    const three = ['a', 'b', 'c'].map((id) => counter({ id, showOnTv: true }));
    const list = [...three, counter({ id: 'd' })];
    expect(canShowOnTv(list, 'a')).toBe(true);
    expect(canShowOnTv(list, 'd')).toBe(false);
    expect(canShowOnTv(list.slice(1), 'd')).toBe(true);
  });
});

describe('order', () => {
  const list = [
    counter({ id: 'a', name: 'A', order: 0 }),
    counter({ id: 'b', name: 'B', order: 1 }),
    counter({ id: 'c', name: 'C', order: 2 }),
  ];

  it('sorts by order, then name', () => {
    const tied = [counter({ id: 'z', name: 'Z', order: 0 }), counter({ id: 'y', name: 'Y' })];
    expect(sortCounters(tied).map((c) => c.id)).toEqual(['y', 'z']);
  });

  it('moves one counter and returns only those whose order changed', () => {
    const changed = moveCounter(list, 'c', 0);
    expect(changed.map((c) => [c.id, c.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect(moveCounter(list, 'a', 1).map((c) => [c.id, c.order])).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('clamps the index, and does nothing for a no-op or an unknown id', () => {
    expect(moveCounter(list, 'a', 0)).toEqual([]);
    expect(moveCounter(list, 'nope', 0)).toEqual([]);
    expect(moveCounter(list, 'a', 99).map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('renumbers counters that shared an order', () => {
    const tied = list.map((c) => ({ ...c, order: 0 }));
    expect(moveCounter(tied, 'a', 0).map((c) => [c.id, c.order])).toEqual([
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('puts a new counter last', () => {
    expect(nextCounterOrder(list)).toBe(3);
    expect(nextCounterOrder([])).toBe(0);
  });
});
