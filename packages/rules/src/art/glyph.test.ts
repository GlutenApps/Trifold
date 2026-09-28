import { describe, expect, it } from 'vitest';
import {
  applySynonyms,
  glyphForCreature,
  glyphForItem,
  glyphForSpell,
  iconNamesIn,
  type IconTableSet,
} from './glyph';

const tables: IconTableSet = {
  creatureType: { undead: 'skull', humanoid: 'cowled', beast: 'beast-eye', dragon: 'dragon-head' },
  ancestry: { Dragon: 'dragon-head', Golem: 'golem-head' },
  nameKeywords: {
    goblin: 'goblin-head',
    hobgoblin: 'goblin-head',
    wolf: 'wolf-head',
    zombie: 'shambling-zombie',
    ghost: 'ghost',
    hag: 'witch-face',
    'sea hag': 'witch-face',
    skeleton: 'skeleton-inside',
  },
  synonyms: { ghoul: 'zombie', wraith: 'ghost', dire: '', wight: 'skeleton' },
  itemType: { LA: 'leather-armor', P: 'potion-ball' },
  spellSchool: { EV: 'explosion' },
};

describe('glyph selection', () => {
  it('prefers ancestry, then name keywords, then synonyms, then creature type', () => {
    expect(
      glyphForCreature({ name: 'Flesh Golem', type: 'construct', ancestry: 'Golem' }, tables),
    ).toEqual({
      icon: 'golem-head',
      via: 'ancestry',
    });
    expect(glyphForCreature({ name: 'Goblin Boss', type: 'humanoid' }, tables)).toEqual({
      icon: 'goblin-head',
      via: 'keyword',
    });
    expect(glyphForCreature({ name: 'Ghoul', type: 'undead' }, tables)).toEqual({
      icon: 'shambling-zombie',
      via: 'synonym',
    });
    expect(glyphForCreature({ name: 'Banshee', type: 'Undead' }, tables)).toEqual({
      icon: 'skull',
      via: 'type',
    });
    expect(glyphForCreature({ name: 'Tarrasque', type: 'monstrosity' }, tables)).toBeNull();
  });

  it('matches whole words, plurals and edition tags', () => {
    expect(glyphForCreature({ name: 'Dire Wolf [5.5e]' }, tables)?.icon).toBe('wolf-head');
    expect(glyphForCreature({ name: 'Goblins' }, tables)?.icon).toBe('goblin-head');
    expect(glyphForCreature({ name: 'Werewolf' }, tables)).toBeNull();
    expect(glyphForCreature({ name: 'Swarm of Ghosts' }, tables)?.icon).toBe('ghost');
  });

  it('applies synonyms, dropping blanked words', () => {
    expect(applySynonyms('Dire Wight (Elite)', tables.synonyms)).toBe('skeleton');
    expect(applySynonyms('Wraith Lord', tables.synonyms)).toBe('ghost lord');
  });

  it('handles items and spells', () => {
    expect(glyphForItem({ name: 'Potion of Healing', typeCode: 'P' }, tables)).toEqual({
      icon: 'potion-ball',
      via: 'item',
    });
    expect(glyphForItem({ name: 'Wolf Pelt Cloak', typeCode: 'LA' }, tables)?.via).toBe('keyword');
    expect(glyphForSpell({ school: 'ev' }, tables)?.icon).toBe('explosion');
    expect(glyphForSpell({ school: null }, tables)).toBeNull();
  });

  it('lists every icon a table set refers to', () => {
    expect([...iconNamesIn(tables)].sort()).toEqual([
      'beast-eye',
      'cowled',
      'dragon-head',
      'explosion',
      'ghost',
      'goblin-head',
      'golem-head',
      'leather-armor',
      'potion-ball',
      'shambling-zombie',
      'skeleton-inside',
      'skull',
      'witch-face',
      'wolf-head',
    ]);
  });
});
