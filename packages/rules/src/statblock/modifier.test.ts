import { describe, expect, it } from 'vitest';
import { parseModifier } from './modifier';

describe('parseModifier', () => {
  it('splits on the last signed integer', () => {
    expect(parseModifier('bonus', 'ac +2')).toEqual({
      category: 'bonus',
      target: 'ac',
      value: 2,
      raw: 'ac +2',
    });
    expect(parseModifier('Ability Score', 'strength +2')).toMatchObject({
      category: 'ability score',
      target: 'strength',
      value: 2,
    });
    expect(parseModifier('bonus', 'melee attacks -1')).toMatchObject({
      target: 'melee attacks',
      value: -1,
    });
  });

  it('rejects values without a number', () => {
    expect(parseModifier('bonus', 'advantage on saves')).toBeNull();
  });
});
