import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gmCrToString } from './gmNative';
import { parseCampaignXml } from './index';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures', 'campaign-sample.xml');
let n = 0;
const options = {
  statBlockSourceId: 'src-camp',
  defaultEdition: '2014' as const,
  newId: () => `id-${(n += 1)}`,
};

describe('parseCampaignXml (Game Master export shape)', () => {
  const result = parseCampaignXml(readFileSync(FIXTURE, 'utf8'), options);

  it('descends data > campaign and reads name and notes, skipping empty ones', () => {
    expect(result.rootElement).toBe('data');
    expect(result.name).toBe('Sample One-Shot');
    expect(result.notes.map((x) => x.title)).toEqual(['Rumours']);
    expect(result.notes[0]?.body).toBe(
      'Three rumours circulate in the village.\n\nThe third one is true.',
    );
  });

  it('maps native PC blocks: label as name, class and level from name, csv abilities, numbered saves', () => {
    expect(result.pcs).toHaveLength(2);
    expect(result.pcs[0]).toMatchObject({
      uid: '101',
      name: 'Thora',
      classText: 'Dwarf, Hill Fighter',
      level: 5,
      maxHp: 44,
      ac: 18,
      initiativeBonus: 1,
      speed: 25,
      passivePerception: 14,
      saves: { str: 6, con: 5 },
    });
    expect(result.pcs[1]).toMatchObject({
      uid: '102',
      name: 'Zed',
      classText: 'Elf, High Wizard',
      level: 5,
      initiativeBonus: 2,
      saves: { int: 7, wis: 4 },
    });
  });

  it('converts NPC stat blocks with nested spells and a Source trait', () => {
    expect(result.npcs.map((x) => [x.name, x.uid, x.isEnemy, x.statBlockKey])).toEqual([
      ['Keep Warden', '201', true, 'keep warden'],
      ['Old Marla', '202', false, undefined],
    ]);
    const warden = result.statBlocks.find((r) => r.kind === 'monster' && r.key === 'keep warden');
    if (!warden || warden.kind !== 'monster') throw new Error('warden');
    expect(warden.sourceBook).toBe('Sample One-Shot');
    expect(warden.sourcePage).toBe(3);
    expect(warden.data).toMatchObject({
      ac: { value: 15, note: 'chain shirt' },
      hp: { average: 27, formula: '5d8+5' },
      abilities: { str: 14, dex: 12, con: 12, int: 16, wis: 11, cha: 10 },
      saves: { int: 5 },
      skills: { Arcana: 5 },
      cr: '1',
      xp: 200,
      spellcasting: { spells: ['Fire Bolt', 'Shield'], slots: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    });
    expect(warden.data.traits.map((t) => t.name)).toEqual(['Spellcasting']);
    expect(warden.data.actions[0]?.attacks[0]).toMatchObject({
      label: 'Spear',
      toHit: 4,
      damage: '1d6+2',
      damageType: 'piercing',
    });

    const spells = result.statBlocks.filter((r) => r.kind === 'spell');
    expect(spells.map((s) => s.name)).toEqual(['Fire Bolt', 'Shield']);
    expect(spells[0]?.kind === 'spell' && spells[0].data).toMatchObject({
      level: 0,
      school: 'EV',
      components: 'V, S',
      classes: ['Sorcerer', 'Wizard'],
      rolls: [{ dice: '1d10' }],
    });
    expect(spells[1]?.kind === 'spell' && spells[1].data).toMatchObject({ level: 1, school: 'A' });
  });

  it('reads uid-referenced and inline encounter combatants, deduplicating identical inline blocks', () => {
    const gate = result.encounters[0]!;
    expect(gate.name).toBe('E1 - Gate');
    expect(gate.notes).toBe('Phased fight: The bear arrives on round 3.');
    expect(gate.combatants.map((c) => [c.name, c.uid, c.label, c.role, c.statBlockKey])).toEqual([
      ['#101', '101', undefined, 'enemy', undefined],
      ['#102', '102', undefined, 'enemy', undefined],
      ['#201', '201', undefined, 'enemy', undefined],
      ['Wolf', undefined, 'Wolf 1', 'enemy', 'wolf'],
      ['Wolf', undefined, 'Wolf 2', 'enemy', 'wolf'],
      ['Brown Bear', undefined, 'Bear', 'enemy', 'brown bear'],
    ]);
    const wolves = result.statBlocks.filter((r) => r.kind === 'monster' && r.key === 'wolf');
    expect(wolves).toHaveLength(1);
    if (wolves[0]?.kind !== 'monster') throw new Error('wolf');
    expect(wolves[0].data.cr).toBe('1/4');
    expect(wolves[0].data.size).toBe('M');
    expect(wolves[0].sourceBook).toBe('System Reference Document 5.1');
    expect(wolves[0].data.skills).toEqual({ Perception: 3, Stealth: 4 });
    const bear = result.statBlocks.find((r) => r.kind === 'monster' && r.key === 'brown bear');
    expect(bear?.kind === 'monster' && bear.data.size).toBe('L');
  });

  it('still reads the older guessed shapes: adventures with named combatant entries', () => {
    const adv = result.adventures[0]!;
    expect(adv.name).toBe('The Sunken Keep');
    expect(adv.notes.map((x) => x.title)).toEqual(['Read-aloud: the gate']);
    expect(adv.encounters[0]?.combatants).toEqual([
      { name: 'Keep Warden', quantity: 1, role: 'enemy', hidden: false, isPc: false },
      {
        name: 'Goblin Warrior [5.5e]',
        quantity: 3,
        role: 'enemy',
        hidden: true,
        isPc: false,
        label: 'Archers',
      },
      { name: 'Old Marla', quantity: 1, role: 'ally', hidden: false, isPc: false },
    ]);
  });

  it('collects items and reports only truly unknown elements', () => {
    expect(result.items).toEqual([
      { name: 'Potion of Healing', quantity: 1, text: expect.stringContaining('Rarity: Common') },
    ]);
    expect(result.warnings).toEqual([
      'encounter "Warden\'s chamber": unknown element <surprise> ignored',
    ]);
  });

  it('treats a Fight Club GM export as a campaign with one PC (either root)', () => {
    const gm = parseCampaignXml(
      '<campaign version="5"><pc><name>Bryn</name><ac>16</ac><hp>31</hp><dex>16</dex><str>10</str><con>12</con></pc></campaign>',
      options,
    );
    expect(gm.name).toBeNull();
    expect(gm.pcs).toEqual([
      { name: 'Bryn', maxHp: 31, ac: 16, initiativeBonus: 3, saves: {}, notes: '' },
    ]);
  });

  it('decodes Game Master CR codes', () => {
    expect(['-3', '-2', '-1', '0', '1', '6'].map(gmCrToString)).toEqual([
      '0',
      '1/8',
      '1/4',
      '1/2',
      '1',
      '6',
    ]);
    expect(gmCrToString(undefined)).toBeUndefined();
  });
});
