import { describe, expect, it } from 'vitest';
import { afterLongRest, carriedOut, withCondition, withoutCondition } from './conditions';

/** Conditions outside a fight (ADR 0049). */
const prone = { id: 'p', name: 'Prone', appliedRound: 0 };
const ex = (level: number) => ({ id: `e${level}`, name: 'Exhaustion', level, appliedRound: 0 });

describe('conditions outside a fight', () => {
  it('adds a condition, and a new Exhaustion level replaces the old one', () => {
    expect(withCondition([prone], ex(1)).map((c) => c.id)).toEqual(['p', 'e1']);
    expect(withCondition([prone, ex(1)], ex(2))).toEqual([prone, ex(2)]);
    expect(withoutCondition([prone, ex(2)], 'p')).toEqual([ex(2)]);
  });

  it('carries every condition out of a fight, without its duration', () => {
    const timed = {
      id: 'f',
      name: 'Frightened',
      duration: { kind: 'rounds', remaining: 2 },
      appliedRound: 3,
    };
    expect(carriedOut([timed])).toEqual([{ id: 'f', name: 'Frightened', appliedRound: 0 }]);
  });

  it('lowers Exhaustion a level on a long rest, and leaves other conditions', () => {
    expect(afterLongRest([prone, ex(2)])).toEqual([prone, { ...ex(2), level: 1 }]);
    expect(afterLongRest([ex(1)])).toEqual([]);
  });
});
