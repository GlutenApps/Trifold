import { describe, expect, it } from 'vitest';
import { candidateKeys, matchArtFiles } from './artMatch';

/** Add from folder matches files to creatures by name (ADR 0033). */
describe('art file matching', () => {
  it('reads a file name the way the compendium reads names, letting go of trailing extras', () => {
    expect(candidateKeys('Goblin_Warrior')).toEqual(['goblin warrior']);
    expect(candidateKeys('owlbear-token-02')).toEqual([
      'owlbear token 02',
      'owlbear token',
      'owlbear',
    ]);
    expect(candidateKeys('Adult Red Dragon [5.5e]')).toEqual(['adult red dragon']);
  });

  it('matches one file per creature, says which already have art, and lists the misses', () => {
    const creatures = new Map([
      ['goblin warrior', { name: 'Goblin Warrior', hasArt: false }],
      ['owlbear', { name: 'Owlbear', hasArt: true }],
    ]);
    const file = (name: string) => ({ path: `/art/${name}.png`, name });
    const { matches, misses } = matchArtFiles(
      [file('goblin-warrior'), file('Owlbear token'), file('goblin warrior 2'), file('Beholder')],
      creatures,
    );
    expect(matches.map((m) => [m.file.name, m.name, m.hasArt])).toEqual([
      ['goblin-warrior', 'Goblin Warrior', false],
      ['Owlbear token', 'Owlbear', true],
    ]);
    expect(misses.map((f) => f.name)).toEqual(['goblin warrior 2', 'Beholder']);
  });
});
