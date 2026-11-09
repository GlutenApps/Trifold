import { describe, expect, it } from 'vitest';
import { matchName, rankByName } from './nameSearch';

describe('matchName', () => {
  it('ranks exact, prefix, word start and substring', () => {
    expect(matchName('goblin', 'Goblin')).toBe('exact');
    expect(matchName('gob', 'Goblin Warrior')).toBe('prefix');
    expect(matchName('war', 'Goblin Warrior')).toBe('word');
    expect(matchName('obl', 'Goblin Warrior')).toBe('substring');
    expect(matchName('orc', 'Goblin Warrior')).toBeNull();
  });

  it('ignores case, punctuation and edition tags', () => {
    expect(matchName('hespers', "Hesper's letter")).toBe('prefix');
    expect(matchName('goblin', 'Goblin [5.5e]')).toBe('exact');
    expect(matchName('', 'Goblin')).toBeNull();
  });
});

describe('rankByName', () => {
  const items = [
    { name: 'Warhorse' },
    { name: 'Goblin Warrior' },
    { name: 'War Priest' },
    { name: 'Dwarf' },
    { name: 'war' },
  ];

  it('orders by tier then name and drops non-matches', () => {
    const ranked = rankByName('war', items, (i) => i.name);
    expect(ranked.map((m) => `${m.tier}:${m.name}`)).toEqual([
      'exact:war',
      'prefix:War Priest',
      'prefix:Warhorse',
      'word:Goblin Warrior',
      'substring:Dwarf',
    ]);
  });

  it('takes the best of several names and honours the limit', () => {
    const scenes = [
      { title: 'Bridge', subtitle: 'The old crossing' },
      { title: 'The crossing', subtitle: '' },
    ];
    const ranked = rankByName('crossing', scenes, (s) => [s.title, s.subtitle]);
    expect(ranked.map((m) => m.item.title)).toEqual(['The crossing', 'Bridge']);
    expect(ranked[1]!.name).toBe('The old crossing');
    expect(rankByName('crossing', scenes, (s) => [s.title, s.subtitle], 1)).toHaveLength(1);
  });

  it('matches nothing on a blank query', () => {
    expect(rankByName('  ', items, (i) => i.name)).toEqual([]);
  });
});
