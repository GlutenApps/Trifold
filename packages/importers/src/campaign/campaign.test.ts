import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCampaignXml } from './index';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures', 'campaign-sample.xml');
let n = 0;
const options = {
  statBlockSourceId: 'src-camp',
  defaultEdition: '2014' as const,
  newId: () => `id-${(n += 1)}`,
};

describe('parseCampaignXml', () => {
  const result = parseCampaignXml(readFileSync(FIXTURE, 'utf8'), options);

  it('reads the campaign name and top-level description', () => {
    expect(result.rootElement).toBe('campaign');
    expect(result.name).toBe('Sample One-Shot');
    expect(result.notes.map((x) => x.title)).toEqual(['Campaign description', 'Rumours']);
    expect(result.notes[1]?.body).toBe(
      'Three rumours circulate in the village.\n\nThe third one is true.',
    );
  });

  it('maps PC stat blocks onto card fields', () => {
    expect(result.pcs).toHaveLength(2);
    expect(result.pcs[0]).toMatchObject({
      name: 'Thora',
      playerName: 'Sam',
      classText: 'Fighter',
      level: 5,
      maxHp: 44,
      ac: 18,
      initiativeBonus: 1,
      speed: 30,
      passivePerception: 12,
      saves: { str: 6, con: 5 },
      notes: 'Shield-bearer of the northern clans.',
    });
    expect(result.pcs[1]).toMatchObject({
      name: 'Zed',
      level: 5,
      initiativeBonus: 2,
      spellSaveDc: 14,
    });
  });

  it('separates plain NPCs from NPCs with inline stat blocks', () => {
    expect(result.npcs[0]).toEqual({
      name: 'Old Marla',
      role: 'innkeeper',
      location: 'The Drowned Rat',
      notes: "Knows the way into the keep and wants her brother's ring back.",
      isAlive: true,
    });
    expect(result.npcs[1]).toMatchObject({ name: 'Keep Warden', statBlockKey: 'keep warden' });
    expect(result.statBlocks).toHaveLength(1);
    const warden = result.statBlocks[0]!;
    expect(warden.kind).toBe('monster');
    expect(warden.sourceId).toBe('src-camp');
    expect(warden.kind === 'monster' && warden.data.actions[0]?.attacks[0]).toMatchObject({
      toHit: 4,
      damage: '1d6+2',
    });
  });

  it('nests notes and encounters under adventures and reads both encounter shapes', () => {
    expect(result.adventures).toHaveLength(1);
    const adv = result.adventures[0]!;
    expect(adv.name).toBe('The Sunken Keep');
    expect(adv.summary).toBe('The party arrives at the ruined keep at dusk.');
    expect(adv.notes.map((x) => x.title)).toEqual(['Read-aloud: the gate']);
    expect(adv.encounters[0]).toMatchObject({
      name: 'Gate guards',
      notes: 'Two goblins watch the gate.',
    });
    expect(adv.encounters[0]?.combatants).toEqual([
      { name: 'Goblin Warrior [5.5e]', quantity: 2, role: 'enemy', hidden: false, isPc: false },
      { name: 'Thora', quantity: 1, role: 'ally', hidden: false, isPc: true },
    ]);

    const chamber = result.encounters[0]!;
    expect(chamber.combatants).toEqual([
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

  it('collects items and reports unknown elements instead of failing', () => {
    expect(result.items).toEqual([{ name: 'Potion of Healing', quantity: 2, text: '' }]);
    expect(result.warnings).toEqual([
      'encounter "Warden\'s chamber": unknown element <surprise> ignored',
    ]);
  });

  it('treats a Fight Club GM export as a campaign with one PC', () => {
    const gm = parseCampaignXml(
      '<campaign version="5"><pc><name>Bryn</name><ac>16</ac><hp>31</hp><dex>16</dex><str>10</str><con>12</con></pc></campaign>',
      options,
    );
    expect(gm.name).toBeNull();
    expect(gm.pcs).toEqual([
      { name: 'Bryn', maxHp: 31, ac: 16, initiativeBonus: 3, saves: {}, notes: '' },
    ]);
  });
});
