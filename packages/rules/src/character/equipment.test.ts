import { describe, expect, it } from 'vitest';
import type { ItemRecord } from '@trifold/schema';
import { equipmentToSheet, findItem, itemArmor, optionItems } from './equipment';

const item = (name: string, data: Record<string, unknown>) =>
  ({
    schemaVersion: 1,
    id: name,
    kind: 'item',
    key: name.toLowerCase(),
    name,
    displayName: name,
    sourceId: 'srd-2024',
    edition: '2024',
    tags: [],
    data: {
      magic: false,
      properties: [],
      stealthDisadvantage: false,
      text: '',
      rolls: [],
      modifiers: [],
      extra: {},
      ...data,
    },
  }) as unknown as ItemRecord;

/** SRD items as the snapshot holds them. */
const items = new Map(
  [
    item('Chain Mail', { typeCode: 'HA', ac: 16 }),
    item('Leather Armor', { typeCode: 'LA', ac: 11 }),
    item('Shield', { typeCode: 'HA', ac: 2 }),
    item('Greatsword', { typeCode: 'M', dmg1: '2d6', dmgType: 'S', properties: ['H', '2H'] }),
    item('Longbow', { typeCode: 'R', dmg1: '1d8', dmgType: 'P', properties: ['A', '2H'] }),
    item('Dagger', { typeCode: 'M', dmg1: '1d4', dmgType: 'P', properties: ['F', 'L', 'T'] }),
    item('Javelin', { typeCode: 'M', dmg1: '1d6', dmgType: 'P', properties: ['T'] }),
    item("Dungeoneer's Pack", { typeCode: 'G' }),
  ].map((r) => [r.displayName.toLowerCase(), r]),
);
const abilities = { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 };

describe('starting equipment (docs/BUILDER.md)', () => {
  it('reads an option into items and gold', () => {
    expect(
      optionItems("A: Chain Mail, Greatsword, 8 Javelins, Dungeoneer's Pack, and 4 GP"),
    ).toEqual({
      items: [
        { name: 'Chain Mail', quantity: 1 },
        { name: 'Greatsword', quantity: 1 },
        { name: 'Javelins', quantity: 8 },
        { name: "Dungeoneer's Pack", quantity: 1 },
      ],
      gp: 4,
    });
    expect(optionItems('B: 75 GP')).toEqual({ items: [], gp: 75 });
    // A comma inside brackets is part of the item.
    expect(optionItems('A: Book (prayers, hymns), Robe, 8 GP').items.map((i) => i.name)).toEqual([
      'Book (prayers, hymns)',
      'Robe',
    ]);
  });

  it('finds an item by its plural or bracketed name', () => {
    expect(findItem('Javelins', items)?.displayName).toBe('Javelin');
    expect(findItem('Daggers', items)?.displayName).toBe('Dagger');
    expect(findItem('Chain Mail', items)?.displayName).toBe('Chain Mail');
    expect(findItem('Holy Symbol', items)).toBeUndefined();
  });

  it('sets armour and a shield, links items, and makes attacks of weapons', () => {
    const out = equipmentToSheet(
      [
        { name: 'Chain Mail', quantity: 1 },
        { name: 'Shield', quantity: 1 },
        { name: 'Greatsword', quantity: 1 },
        { name: 'Longbow', quantity: 1 },
        { name: 'Daggers', quantity: 2 },
        { name: 'Holy Symbol', quantity: 1 },
      ],
      items,
      abilities,
    );
    expect(out.armor).toEqual({ kind: 'heavy', base: 16, shield: true, bonus: 0 });
    expect(
      out.equipment.map((e) => `${e.quantity} ${e.name}${e.ref ? '' : ' (no record)'}`),
    ).toEqual([
      '1 Chain Mail',
      '1 Shield',
      '1 Greatsword',
      '1 Longbow',
      '2 Dagger',
      '1 Holy Symbol (no record)',
    ]);
    expect(out.attacks.map((a) => [a.name, a.ability, a.damage])).toEqual([
      ['Greatsword', 'str', '2d6+3 slashing'],
      ['Longbow', 'dex', '1d8+2 piercing'],
      // Finesse takes the better of the two: Strength here.
      ['Dagger', 'str', '1d4+3 piercing'],
    ]);
  });

  it('wears the first body armour and shield, and knows what each adds to AC', () => {
    const out = equipmentToSheet(
      [
        { name: 'Chain Mail', quantity: 1 },
        { name: 'Leather Armor', quantity: 1 },
        { name: 'Shield', quantity: 1 },
        { name: 'Dagger', quantity: 1 },
      ],
      items,
      abilities,
    );
    expect(out.equipment.map((e) => [e.name, e.equipped, e.armor])).toEqual([
      ['Chain Mail', true, { kind: 'heavy', base: 16 }],
      ['Leather Armor', false, { kind: 'light', base: 11 }],
      ['Shield', true, { kind: 'shield', base: 2 }],
      ['Dagger', undefined, undefined],
    ]);
  });

  it('reads armour from a record: body armour by type, a shield by type or name', () => {
    expect(itemArmor('Breastplate', { typeCode: 'MA', ac: 14 })).toEqual({
      kind: 'medium',
      base: 14,
    });
    expect(itemArmor('Shield', { typeCode: 'S' })).toEqual({ kind: 'shield', base: 2 });
    expect(itemArmor('Shield +1', { typeCode: 'HA', ac: 3 })).toEqual({ kind: 'shield', base: 3 });
    expect(itemArmor('Rope', { typeCode: 'G' })).toBeUndefined();
  });

  it('leaves the armour alone without body armour or a shield', () => {
    expect(equipmentToSheet([{ name: 'Dagger', quantity: 1 }], items, abilities).armor).toBeNull();
    expect(
      equipmentToSheet([{ name: 'Leather Armor', quantity: 1 }], items, { ...abilities, dex: 18 })
        .armor,
    ).toEqual({ kind: 'light', base: 11, shield: false, bonus: 0 });
  });
});
