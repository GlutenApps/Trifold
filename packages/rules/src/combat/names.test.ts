import { describe, expect, it } from 'vitest';
import { groupNames, nextNumberedName, playerLabels } from './misc';

describe('nextNumberedName', () => {
  it('keeps the plain name for the first and numbers the rest', () => {
    expect(nextNumberedName('Goblin', [])).toBe('Goblin');
    expect(nextNumberedName('Goblin', ['Goblin'])).toBe('Goblin 2');
    expect(nextNumberedName('Goblin', ['Goblin', 'Goblin 2'])).toBe('Goblin 3');
    // After the highest, even with gaps; other names do not count.
    expect(nextNumberedName('Goblin', ['Goblin 4', 'Goblin Boss', 'Hobgoblin 9'])).toBe('Goblin 5');
  });
});

describe('playerLabels', () => {
  const labels = (items: Array<[string, string, string]>) => [
    ...playerLabels(items.map(([id, name, shown]) => ({ id, name, shown }))).values(),
  ];

  it('gives a masked name the number of the real one', () => {
    expect(
      labels([
        ['a', 'Goblin', 'Humanoid'],
        ['b', 'Goblin 2', 'Humanoid'],
        ['c', 'Goblin 3', 'Humanoid'],
        ['d', 'Brannoc', 'Brannoc'],
      ]),
    ).toEqual(['Humanoid', 'Humanoid 2', 'Humanoid 3', 'Brannoc']);
  });

  it('numbers names that would still read the same, skipping numbers in use', () => {
    expect(
      labels([
        ['a', 'Goblin', 'Goblin'],
        ['b', 'Goblin', 'Goblin'],
        ['c', 'Goblin 2', 'Goblin 2'],
      ]),
    ).toEqual(['Goblin', 'Goblin 3', 'Goblin 2']);
    // Two kinds of creature behind one mask.
    expect(
      labels([
        ['a', 'Goblin 2', 'Humanoid'],
        ['b', 'Bandit 2', 'Humanoid'],
      ]),
    ).toEqual(['Humanoid 2', 'Humanoid 3']);
  });
});

describe('groupNames', () => {
  it('numbers a name across every group that uses it', () => {
    expect(
      groupNames([
        { base: 'Goblin', quantity: 1 },
        { base: 'Wolf', quantity: 1 },
        { base: 'Goblin', quantity: 2 },
        { base: 'Bandit', quantity: 2 },
      ]),
    ).toEqual([['Goblin 1'], ['Wolf'], ['Goblin 2', 'Goblin 3'], ['Bandit 1', 'Bandit 2']]);
  });
});
