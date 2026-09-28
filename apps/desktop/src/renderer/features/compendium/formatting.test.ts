import { describe, expect, it } from 'vitest';
import { linkifySpells, signed, speedText, usesText } from './formatting';

describe('statblock helpers', () => {
  it('formats signed numbers and speeds', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(-1)).toBe('-1');
    expect(
      speedText({
        speeds: { walk: 30, fly: 60, hover: true, notes: [], raw: '' },
      } as never),
    ).toBe('30 ft., Fly 60 ft. (hover)');
  });

  it('describes uses and recharge', () => {
    const base = {
      name: '',
      displayName: '',
      text: '',
      tags: [],
      attacks: [],
      rolls: [],
      saves: [],
    };
    expect(usesText({ ...base, recharge: { min: 5, max: 6 } })).toBe('Recharge 5–6');
    expect(usesText({ ...base, uses: { count: 2, per: 'day' } })).toBe('2/Day');
    expect(usesText(base)).toBeNull();
  });

  it('linkifies known spell names, longest first, case-insensitively', () => {
    const parts = linkifySpells('It casts fireball and Mage Armor at will.', [
      'Fireball',
      'Mage Armor',
    ]);
    expect(parts).toEqual([
      { text: 'It casts ' },
      { text: 'fireball', key: 'fireball' },
      { text: ' and ' },
      { text: 'Mage Armor', key: 'mage armor' },
      { text: ' at will.' },
    ]);
    expect(linkifySpells('nothing', [])).toEqual([{ text: 'nothing' }]);
  });
});
