/**
 * Conditions on a creature outside a fight (ADR 0049): the list a PC card, an NPC or a companion
 * keeps, and how it changes. In a fight the tracker keeps them on the combatant; these follow the
 * same rules so the two never disagree.
 */
export interface HeldCondition {
  id: string;
  name: string;
  level?: number;
  duration?: unknown;
  source?: string;
  appliedRound: number;
}

const isExhaustion = (name: string) => name.toLowerCase() === 'exhaustion';

/**
 * `list` with a condition added. Exhaustion is one condition with a level, so a new level
 * replaces the old one rather than stacking beside it.
 */
export function withCondition<T extends HeldCondition>(list: readonly T[], added: T): T[] {
  const kept = isExhaustion(added.name) ? list.filter((c) => !isExhaustion(c.name)) : [...list];
  return [...kept, added];
}

/** `list` without the condition `id`. */
export function withoutCondition<T extends HeldCondition>(list: readonly T[], id: string): T[] {
  return list.filter((c) => c.id !== id);
}

/**
 * What a creature carries out of a fight: every condition, without the duration it had there
 * (rounds and saves only count in a fight).
 */
export function carriedOut<T extends HeldCondition>(list: readonly T[]): T[] {
  return list.map((c) => {
    const { duration: _duration, ...rest } = c;
    return { ...rest, appliedRound: 0 } as T;
  });
}

/** A long rest (2024 rules): Exhaustion drops one level, gone at 0; other conditions stay. */
export function afterLongRest<T extends HeldCondition>(list: readonly T[]): T[] {
  return list.flatMap((c) => {
    if (!isExhaustion(c.name)) return [c];
    const level = (c.level ?? 1) - 1;
    return level > 0 ? [{ ...c, level }] : [];
  });
}
