import { create } from 'zustand';
import { parseRollRequest, rollRequest, type RollMode } from '@trifold/rules';
import { facesText, useRollLogStore } from './rollLogStore';

/** The dice the app offers as buttons, largest first so expressions read naturally. */
export const POOL_DICE = [100, 20, 12, 10, 8, 6, 4] as const;
export type PoolDie = (typeof POOL_DICE)[number];

export interface DicePool {
  counts: Record<PoolDie, number>;
  modifier: number;
  mode: RollMode;
}

export const EMPTY_COUNTS: Record<PoolDie, number> = {
  100: 0,
  20: 0,
  12: 0,
  10: 0,
  8: 0,
  6: 0,
  4: 0,
};

export function poolIsEmpty(pool: DicePool): boolean {
  return POOL_DICE.every((d) => pool.counts[d] === 0) && pool.modifier === 0;
}

/** `2d6+1d8+3`, or null for an empty pool. A bare modifier means a d20 roll. */
export function poolExpression(pool: DicePool): string | null {
  const parts = POOL_DICE.filter((d) => pool.counts[d] > 0).map((d) => `${pool.counts[d]}d${d}`);
  if (parts.length === 0 && pool.modifier === 0) return null;
  if (parts.length === 0) parts.push('1d20');
  let text = parts.join('+');
  if (pool.modifier > 0) text += `+${pool.modifier}`;
  if (pool.modifier < 0) text += `${pool.modifier}`;
  return text;
}

/** Advantage and disadvantage only mean something for a lone d20. */
export function poolIsSingleD20(pool: DicePool): boolean {
  return pool.counts[20] === 1 && POOL_DICE.every((d) => d === 20 || pool.counts[d] === 0);
}

/** Human summary such as `2d6 + 1d8 + 3`, with the mode when it applies. */
export function poolLabel(pool: DicePool): string {
  const expression = poolExpression(pool);
  if (!expression) return '';
  const pretty = expression.replace(/([+-])/g, ' $1 ');
  const mode = pool.mode !== 'normal' && poolIsSingleD20(pool) ? ` (${pool.mode})` : '';
  return pretty + mode;
}

/** Rolls `text` into the shared log. Returns an error message, or null when it rolled. */
export function rollAndLog(text: string, actor?: string): string | null {
  const request = parseRollRequest(text);
  if (!request) return `Cannot read "${text}". Try 2d6+3, 4d6kh3 or d20 adv.`;
  const result = rollRequest(request);
  const modeNote = request.mode === 'normal' ? '' : ` (${request.mode})`;
  useRollLogStore.getState().add({
    kind: 'dice',
    label: `${request.expression}${modeNote}`,
    expression: request.expression,
    total: result.total,
    faces: facesText(result),
    source: 'pool',
    ...(actor ? { actor } : {}),
  });
  return null;
}

interface DicePoolState extends DicePool {
  add(die: PoolDie, n?: number): void;
  remove(die: PoolDie): void;
  setModifier(value: number): void;
  bumpModifier(delta: number): void;
  setMode(mode: RollMode): void;
  clear(): void;
  /** Rolls the pool into the log and keeps it for a re-roll. Returns the total, or null if empty. */
  roll(): number | null;
}

/**
 * One pool for the whole app (DESIGN.md §6.7): the Dice panel, the tray drawer and the tray bar
 * all show and edit the same selection, so a die added anywhere rolls from anywhere.
 */
export const useDicePoolStore = create<DicePoolState>((set, get) => ({
  counts: { ...EMPTY_COUNTS },
  modifier: 0,
  mode: 'normal',

  add(die, n = 1) {
    set({ counts: { ...get().counts, [die]: Math.min(99, get().counts[die] + n) } });
  },

  remove(die) {
    set({ counts: { ...get().counts, [die]: Math.max(0, get().counts[die] - 1) } });
  },

  setModifier(value) {
    set({ modifier: Math.max(-99, Math.min(99, Math.trunc(value) || 0)) });
  },

  bumpModifier(delta) {
    get().setModifier(get().modifier + delta);
  },

  setMode(mode) {
    set({ mode });
  },

  clear() {
    set({ counts: { ...EMPTY_COUNTS }, modifier: 0, mode: 'normal' });
  },

  roll() {
    const pool = get();
    const expression = poolExpression(pool);
    if (!expression) return null;
    const mode = poolIsSingleD20(pool) ? pool.mode : 'normal';
    const text =
      mode === 'normal' ? expression : `${expression} ${mode === 'advantage' ? 'adv' : 'dis'}`;
    if (rollAndLog(text) !== null) return null;
    return useRollLogStore.getState().entries[0]?.total ?? null;
  },
}));
