import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompendiumRecord } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import { normalizeOpen5e, type Open5eContext } from './normalize';
import type { O5eBase, O5eKind } from './types';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures', 'open5e-sample.json');
const sample = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<O5eKind, O5eBase[]>;

const warnings: string[] = [];
const ctx2024: Open5eContext = {
  sourceId: 'srd-2024',
  edition: '2024',
  sourceBook: 'System Reference Document 5.2',
  warn: (m) => warnings.push(m),
};
const ctx2014: Open5eContext = {
  ...ctx2024,
  sourceId: 'srd-2014',
  edition: '2014',
  sourceBook: 'System Reference Document 5.1',
};

function get(kind: O5eKind, key: string, ctx = ctx2024) {
  const raw = sample[kind].find((r) => r.key === key);
  if (!raw) throw new Error(`${kind} ${key} missing from fixture`);
  return normalizeOpen5e(kind, raw, ctx);
}

describe('normalizeOpen5e', () => {
  it('produces schema-valid records for every kind in the fixture', () => {
    for (const kind of Object.keys(sample) as O5eKind[]) {
      for (const raw of sample[kind]) {
        const record = normalizeOpen5e(
          kind,
          raw,
          raw.document?.key === 'srd-2014' ? ctx2014 : ctx2024,
        );
        const parsed = CompendiumRecord.safeParse(record);
        expect(
          parsed.success,
          `${kind} ${raw.key}: ${JSON.stringify(parsed.error?.issues[0])}`,
        ).toBe(true);
      }
    }
    expect(warnings).toEqual([]);
  });

  it('maps a 2024 creature: header, core stats, features, structured attacks', () => {
    const dragon = get('creatures', 'srd-2024_adult-red-dragon');
    expect(dragon).toMatchObject({
      id: 'srd-2024:monster:srd-2024_adult-red-dragon',
      key: 'adult red dragon',
      displayName: 'Adult Red Dragon',
      sourceId: 'srd-2024',
      sourceBook: 'System Reference Document 5.2',
      edition: '2024',
    });
    if (dragon.kind !== 'monster') throw new Error('kind');
    const d = dragon.data;
    expect(d.size).toBe('H');
    expect(d.type).toBe('dragon');
    expect(d.ac).toEqual({ value: 19, note: 'natural armor' });
    expect(d.hp).toEqual({ average: 256, formula: '19d12+133' });
    expect(d.speeds).toMatchObject({ walk: 40, fly: 80, climb: 40 });
    expect(d.abilities).toEqual({ str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 23 });
    expect(d.saves).toMatchObject({ dex: 6, wis: 7 });
    expect(d.skills).toEqual({ Perception: 13, Stealth: 6 });
    expect(d.initiativeBonus).toBe(12);
    expect(d.senses).toBe('blindsight 60 ft., darkvision 120 ft.');
    expect(d.passivePerception).toBe(23);
    expect(d.cr).toBe('17');
    expect(d.xp).toBe(18000);
    expect(d.damageImmunities).toEqual(['fire']);

    const rend = d.actions.find((a) => a.name === 'Rend');
    expect(rend?.attacks[0]).toMatchObject({
      label: 'Rend',
      toHit: 14,
      damage: '1d10+8',
      damageType: 'slashing',
      reach: '10 ft',
    });
    expect(rend?.attacks[0]?.extraDamage).toEqual([{ damage: '2d4', damageType: 'fire' }]);
    const breath = d.actions.find((a) => a.name === 'Fire Breath');
    expect(breath?.recharge).toEqual({ min: 5, max: 6 });
    expect(breath?.saves[0]).toMatchObject({ ability: 'dex', halfOnSuccess: true });
    expect(d.legendary.perTurn).toBe(3);
    expect(d.legendary.actions.map((a) => a.name)).toEqual([
      'Commanding Presence',
      'Fiery Rays',
      'Pounce',
    ]);
    expect(d.traits[0]?.displayName).toBe('Legendary Resistance (3/Day, or 4/Day in Lair)');
  });

  it('maps a 2014 creature and trusts the text over a wrong structured damage type', () => {
    const dragon = get('creatures', 'srd_adult-red-dragon', ctx2014);
    if (dragon.kind !== 'monster') throw new Error('kind');
    expect(dragon.edition).toBe('2014');
    expect(dragon.data.environment).toEqual(['hills', 'mountain']);
    const bite = dragon.data.actions.find((a) => a.name === 'Bite');
    expect(bite?.attacks[0]).toMatchObject({ toHit: 14, damage: '2d10+8', damageType: 'piercing' });
    expect(bite?.attacks[0]?.extraDamage).toEqual([{ damage: '2d6', damageType: 'fire' }]);
    const wing = dragon.data.legendary.actions.find((a) => a.displayName === 'Wing Attack');
    expect(wing?.cost).toBe(2);
  });

  it('maps a spell with components, scaling rolls and higher-level text', () => {
    const fireball = get('spells', 'srd-2024_fireball');
    if (fireball.kind !== 'spell') throw new Error('kind');
    expect(fireball.data).toMatchObject({
      level: 3,
      school: 'EV',
      ritual: false,
      time: 'Action',
      range: '150 feet',
      components: 'V, S, M (a ball of bat guano and sulfur)',
      duration: 'instantaneous',
      classes: ['Sorcerer', 'Wizard'],
    });
    expect(fireball.data.rolls[0]).toMatchObject({ dice: '8d6', level: 3 });
    expect(fireball.data.rolls.some((r) => r.dice === '9d6' && r.level === 4)).toBe(true);
    expect(fireball.data.text).toContain('Using a Higher-Level Spell Slot.');
  });

  it('maps weapons, armor and potions', () => {
    const sword = get('items', 'srd-2024_longsword');
    if (sword.kind !== 'item') throw new Error('kind');
    expect(sword.data).toMatchObject({
      typeCode: 'M',
      magic: false,
      dmg1: '1d8',
      dmg2: '1d10',
      dmgType: 'S',
      weight: 3,
      value: 15,
    });
    expect(sword.data.properties).toEqual(['V', 'M']);

    const mail = get('items', 'srd-2024_chain-mail');
    if (mail.kind !== 'item') throw new Error('kind');
    expect(mail.data).toMatchObject({
      typeCode: 'HA',
      ac: 16,
      strength: 13,
      stealthDisadvantage: true,
    });

    const potion = get('items', 'srd-2024_potion-of-healing');
    if (potion.kind !== 'item') throw new Error('kind');
    expect(potion.data).toMatchObject({ typeCode: 'P', magic: true });
  });

  it('maps feats, species, backgrounds and classes', () => {
    const feat = get('feats', 'srd-2024_ability-score-improvement');
    if (feat.kind !== 'feat') throw new Error('kind');
    expect(feat.data.prerequisite).toBe('Level 4+');
    expect(feat.data.text).toContain('Increase one ability score');

    const dragonborn = get('species', 'srd-2024_dragonborn');
    if (dragonborn.kind !== 'species') throw new Error('kind');
    expect(dragonborn.data.size).toMatch(/^Medium/);
    expect(dragonborn.data.traits.map((t) => t.name)).toContain('Breath Weapon');

    const acolyte = get('backgrounds', 'srd-2024_acolyte');
    if (acolyte.kind !== 'background') throw new Error('kind');
    expect(acolyte.data.traits.length).toBeGreaterThan(0);

    const wizard = get('classes', 'srd-2024_wizard');
    if (wizard.kind !== 'class') throw new Error('kind');
    expect(wizard.data.hd).toBe(6);
    expect(wizard.data.proficiency).toBe('Intelligence, Wisdom');
    expect(wizard.data.levels.map((l) => l.level)).toEqual([1, 4, 5, 8, 12, 16]);
    expect(wizard.data.levels.find((l) => l.level === 4)?.scoreImprovement).toBe(true);
    expect(wizard.data.levels[0]?.features[0]?.name).toBe('Arcane Recovery');
  });
});
