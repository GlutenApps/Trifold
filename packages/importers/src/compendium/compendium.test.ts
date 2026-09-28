import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompendiumRecord, MonsterRecord } from '@trifold/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCompendiumImporter, parseCompendiumXml } from './index';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml');

let ids = 0;
const options = {
  sourceId: 'src-test',
  defaultEdition: '2014' as const,
  edition2024Books: ['System Reference Document 5.2.1'],
  newId: () => `id-${(ids += 1)}`,
};

let records: CompendiumRecord[];
let warnings: string[];
let counts: Record<string, number | undefined>;

function monster(name: string): MonsterRecord {
  const found = records.find((r) => r.kind === 'monster' && r.name === name);
  if (!found || found.kind !== 'monster') throw new Error(`monster ${name} not in fixture`);
  return found;
}

beforeAll(() => {
  ids = 0;
  const result = parseCompendiumXml(readFileSync(FIXTURE, 'utf8'), options);
  records = result.records;
  warnings = result.warnings;
  counts = result.counts;
});

describe('fixture import', () => {
  it('imports every record kind with no warnings', () => {
    expect(counts).toEqual({
      monster: 6,
      spell: 2,
      item: 5,
      feat: 1,
      species: 1,
      background: 1,
      class: 1,
    });
    expect(warnings).toEqual([]);
  });

  it('parses ac, hp, speed, saves, skills, senses and lists', () => {
    const a = monster('Aboleth');
    expect(a.data.ac).toEqual({ value: 17, note: 'natural armor' });
    expect(a.data.hp).toEqual({ average: 135, formula: '18d10+36' });
    expect(a.data.speeds).toMatchObject({ walk: 10, swim: 40 });
    expect(a.data.saves).toEqual({ con: 6, int: 8, wis: 6 });
    expect(a.data.skills).toEqual({ History: 12, Perception: 10 });
    expect(a.data.passivePerception).toBe(20);
    expect(a.data.environment).toEqual(['underdark']);
    expect(a.data.xp).toBe(5900);

    const shrub = monster('Awakened Shrub');
    expect(shrub.data.damageVulnerabilities).toEqual(['fire']);
    expect(shrub.data.damageResistances).toEqual(['piercing']);
    expect(shrub.data.xp).toBe(10);

    const dragon = monster('Young Red Dragon');
    expect(dragon.data.speeds).toMatchObject({ walk: 40, climb: 40, fly: 80 });
    expect(dragon.data.damageImmunities).toEqual(['fire']);
    expect(dragon.data.ancestry).toBe('Dragon');
    expect(dragon.data.sortName).toBe('Dragon, Red, Young');
  });

  it('tags editions and collapses both Aboleths onto one key', () => {
    const legacy = monster('Aboleth');
    const modern = monster('Aboleth [5.5e]');
    expect(legacy.edition).toBe('2014');
    expect(modern.edition).toBe('2024');
    expect(modern.displayName).toBe('Aboleth');
    expect(modern.key).toBe(legacy.key);
    // 2024 by source book alone, without the suffix, would also work:
    expect(monster('Goblin Warrior [5.5e]').edition).toBe('2024');
    expect(monster('Young Red Dragon').edition).toBe('2014');
  });

  it('extracts the Source line into sourceBook and sourcePage', () => {
    const a = monster('Aboleth');
    expect(a.sourceBook).toBe('System Reference Document 5.1');
    expect(a.sourcePage).toBe(261);
    expect(a.data.description).toBe(
      'Aboleths are ancient amphibious tyrants that lurk in deep water and dominate weaker minds.',
    );
    const modern = monster('Aboleth [5.5e]');
    expect(modern.sourceBook).toBe('System Reference Document 5.2.1');
    expect(modern.sourcePage).toBe(340);
    expect(monster('Awakened Shrub').data.description).toBeUndefined();
  });

  it('lifts the Proficiency Bonus trait, keeps Treasure, and uses init', () => {
    const modern = monster('Aboleth [5.5e]');
    expect(modern.data.proficiencyBonus).toBe(4);
    expect(modern.data.initiativeBonus).toBe(7);
    expect(modern.data.traits.map((t) => t.name)).toEqual(['Amphibious', 'Treasure']);
    expect(monster('Aboleth').data.proficiencyBonus).toBeUndefined();
    expect(monster('Aboleth').data.initiativeBonus).toBeUndefined();
  });

  it('handles feature names: uses, recharge codes, bonus actions, costs', () => {
    const a = monster('Aboleth');
    const enslave = a.data.actions.find((f) => f.name === 'Enslave (3/Day)');
    expect(enslave?.displayName).toBe('Enslave');
    expect(enslave?.uses).toEqual({ count: 3, per: 'day' });
    expect(enslave?.saves).toEqual([{ ability: 'wis', dc: 14, halfOnSuccess: false }]);

    const breath = monster('Young Red Dragon').data.actions.find(
      (f) => f.displayName === 'Fire Breath',
    );
    expect(breath?.recharge).toEqual({ min: 5, max: 6 });
    expect(breath?.saves).toEqual([{ ability: 'dex', dc: 17, halfOnSuccess: true }]);
    expect(breath?.rolls).toEqual([{ label: 'Fire Breath', dice: '16d6' }]);
    expect(breath?.attacks).toEqual([]);

    const goblin = monster('Goblin Warrior [5.5e]');
    expect(goblin.data.actions.map((f) => f.name)).toEqual(['Scimitar', 'Shortbow']);
    expect(goblin.data.bonusActions.map((f) => f.displayName)).toEqual(['Nimble Escape']);
    expect(goblin.data.bonusActions[0]?.tags).toContain('bonus-action');
  });

  it('parses attack triples in both editions, including blank to-hit and compound dice', () => {
    const tentacle2014 = monster('Aboleth').data.actions.find((f) => f.name === 'Tentacle');
    expect(tentacle2014?.attacks).toEqual([
      {
        label: 'Tentacle',
        toHit: 9,
        damage: '2d6+5',
        damageType: 'bludgeoning',
        reach: '10 ft',
        extraDamage: [],
      },
    ]);
    expect(tentacle2014?.saves).toEqual([{ ability: 'con', dc: 14, halfOnSuccess: false }]);

    const tentacle2024 = monster('Aboleth [5.5e]').data.actions.find((f) => f.name === 'Tentacle');
    expect(tentacle2024?.attacks[0]).toEqual({
      label: 'Bludgeoning Damage',
      toHit: 9,
      damage: '2d6+5',
      damageType: 'bludgeoning',
      reach: '15 ft',
      extraDamage: [{ damage: '2d6', damageType: 'acid' }],
    });
    expect(tentacle2024?.attacks[1]).toMatchObject({
      label: 'Acid Damage',
      damage: '2d6',
      damageType: 'acid',
    });

    const bite = monster('Young Red Dragon').data.actions.find((f) => f.name === 'Bite');
    expect(bite?.attacks[0]).toMatchObject({
      damage: '(2d10+6)+(1d6)',
      damageType: 'piercing',
      extraDamage: [{ damage: '1d6', damageType: 'fire' }],
    });

    const dagger = monster('Mage').data.actions[0];
    expect(dagger?.attacks[0]).toMatchObject({ toHit: 5, reach: '5 ft. or range 20/60 ft' });
  });

  it('turns a 2024 save action with a blank to-hit triple into a save call plus damage roll', () => {
    const consume = monster('Aboleth [5.5e]').data.actions.find(
      (f) => f.name === 'Consume Memories',
    );
    expect(consume?.saves).toEqual([{ ability: 'int', dc: 16, halfOnSuccess: true }]);
    expect(consume?.rolls).toEqual([{ label: 'Psychic Damage', dice: '3d6' }]);
    expect(consume?.attacks).toEqual([]);
  });

  it('splits the legendary header, options with costs, and lair actions', () => {
    const a = monster('Aboleth');
    expect(a.data.legendary.perTurn).toBe(3);
    expect(a.data.legendary.header).toMatch(/^The aboleth can take 3 legendary actions/);
    expect(a.data.legendary.actions.map((f) => f.displayName)).toEqual([
      'Detect',
      'Tail Swipe',
      'Psychic Drain',
    ]);
    expect(a.data.legendary.actions[2]?.cost).toBe(2);
    expect(a.data.legendary.actions[2]?.rolls).toEqual([{ label: 'Psychic Damage', dice: '3d6' }]);
    expect(a.data.lair.map((f) => f.name)).toEqual(['Aboleth Lairs', 'Phantasmal Image']);
    expect(monster('Goblin Warrior [5.5e]').data.legendary).toEqual({ actions: [] });
  });

  it('parses spells and slots on casters', () => {
    const mage = monster('Mage');
    expect(mage.data.spellcasting?.slots).toEqual([0, 4, 3, 3, 3, 1]);
    expect(mage.data.spellcasting?.spells).toContain('Fireball');
    expect(mage.data.reactions).toHaveLength(1);
    expect(mage.data.type).toBe('humanoid');
    expect(mage.data.subtype).toBe('any race');
    expect(monster('Aboleth').data.spellcasting).toBeUndefined();
  });

  it('preserves unknown elements in extra', () => {
    expect(monster('Aboleth').data.extra).toEqual({
      homebrewNote: [
        '<homebrewNote>Kept as-is: unknown element for the extra test.</homebrewNote>',
      ],
    });
    expect(monster('Mage').data.extra).toEqual({});
  });

  it('normalizes spells, items, containers, feats, species, backgrounds and classes', () => {
    const fireballs = records.filter((r) => r.kind === 'spell');
    expect(fireballs.map((s) => s.edition)).toEqual(['2014', '2024']);
    expect(fireballs[0]?.kind === 'spell' && fireballs[0].data).toMatchObject({
      level: 3,
      school: 'EV',
      classes: ['Sorcerer', 'Wizard'],
      rolls: [
        { dice: '8d6', description: 'Fire Damage', level: 3 },
        { dice: '9d6', description: 'Fire Damage', level: 4 },
      ],
    });
    expect(fireballs[0]?.sourcePage).toBe(144);
    expect(fireballs[0]?.kind === 'spell' && fireballs[0].data.text).not.toMatch(/Source:/);
    expect(fireballs[1]?.key).toBe(fireballs[0]?.key);

    const items = records.filter((r) => r.kind === 'item');
    const sword = items.find((i) => i.name === 'Longsword');
    expect(sword?.kind === 'item' && sword.data).toMatchObject({
      typeCode: 'M',
      magic: false,
      dmg1: '1d8',
      dmg2: '1d10',
      dmgType: 'S',
      properties: ['V', 'M'],
      weight: 3,
      value: 15,
    });
    const ring = items.find((i) => i.name === 'Ring of Protection');
    expect(ring?.kind === 'item' && ring.data).toMatchObject({
      rarity: 'rare',
      requiresAttunement: true,
      modifiers: [
        { category: 'bonus', target: 'ac', value: 1, raw: 'ac +1' },
        { category: 'bonus', target: 'saving throws', value: 1, raw: 'saving throws +1' },
      ],
    });
    const potion = items.find((i) => i.name === 'Potion of Healing');
    expect(potion?.kind === 'item' && potion.data).toMatchObject({
      rarity: 'common',
      requiresAttunement: false,
      rolls: [{ dice: '2d4+2', description: 'Heal' }],
    });
    const mail = items.find((i) => i.name === 'Chain Mail');
    expect(mail?.kind === 'item' && mail.data).toMatchObject({
      ac: 16,
      strength: 13,
      stealthDisadvantage: true,
    });
    const pack = items.find((i) => i.name === "Explorer's Pack");
    expect(pack?.kind === 'item' && pack.data).toMatchObject({
      typeCode: 'G',
      contents: [
        { name: 'Backpack', quantity: 1 },
        { name: 'Torch', quantity: 10 },
      ],
      text: 'Contents: 1 × Backpack, 10 × Torch.',
    });

    const feat = records.find((r) => r.kind === 'feat');
    expect(feat?.kind === 'feat' && feat.data.modifiers).toEqual([
      { category: 'bonus', target: 'initiative', value: 5, raw: 'initiative +5' },
    ]);

    const dwarf = records.find((r) => r.kind === 'species');
    expect(dwarf?.kind === 'species' && dwarf.data).toMatchObject({
      size: 'M',
      speed: '25',
      ability: 'Con +2',
    });
    expect(dwarf?.kind === 'species' && dwarf.data.traits.map((t) => t.category)).toEqual([
      'description',
      'species',
      'species',
    ]);

    const acolyte = records.find((r) => r.kind === 'background');
    expect(acolyte?.kind === 'background' && acolyte.data.traits).toHaveLength(2);

    const wizard = records.find((r) => r.kind === 'class');
    expect(wizard?.kind === 'class' && wizard.data).toMatchObject({
      hd: 6,
      numSkills: 2,
      slotsReset: 'L',
    });
    expect(wizard?.kind === 'class' && wizard.data.levels.map((l) => l.level)).toEqual([1, 2, 4]);
    expect(wizard?.kind === 'class' && wizard.data.levels[0]?.slots).toEqual({
      values: [3, 2],
      optional: false,
    });
    expect(wizard?.kind === 'class' && wizard.data.levels[0]?.counters).toEqual([
      { name: 'Arcane Recovery', value: 1, reset: 'L' },
    ]);
    expect(wizard?.kind === 'class' && wizard.data.levels[1]?.features[0]).toMatchObject({
      name: 'School of Evocation: Evocation Savant',
      optional: true,
    });
    expect(wizard?.kind === 'class' && wizard.data.levels[2]?.scoreImprovement).toBe(true);
  });
});

describe('streaming and leniency', () => {
  it('produces identical records when fed in small chunks', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    let n = 0;
    const opts = { ...options, newId: () => `c-${(n += 1)}` };
    const chunked: CompendiumRecord[] = [];
    const importer = createCompendiumImporter(opts, (r) => chunked.push(r));
    for (let i = 0; i < xml.length; i += 97) importer.write(xml.slice(i, i + 97));
    const stats = importer.end();

    n = 0;
    const whole = parseCompendiumXml(xml, opts);
    expect(chunked).toEqual(whole.records);
    expect(stats.counts).toEqual(whole.counts);
    expect(stats.rootElement).toBe('compendium');
  });

  it('warns and skips a nameless record, warns on a bad recharge code, keeps going', () => {
    const xml = `<compendium version="5">
      <monster><size>M</size><type>beast</type><cr>1</cr></monster>
      <monster><name>Test Beast</name><size>M</size><type>beast</type><ac>12</ac><hp>5</hp><speed>30 ft.</speed>
        <str>10</str><dex>10</dex><con>10</con><int>2</int><wis>10</wis><cha>4</cha><cr>1/8</cr><npc>YES</npc>
        <action><name>Bite</name><text>Bites.</text><attack>Bite|+2|1d4</attack><recharge>WEIRD</recharge></action>
      </monster>
      <widget><name>Nope</name></widget>
      <spell><name>Blank Spell</name><level>x</level></spell>
    </compendium>`;
    const result = parseCompendiumXml(xml, options);
    expect(result.records.map((r) => r.name)).toEqual(['Test Beast', 'Blank Spell']);
    expect(result.skipped).toBe(2);
    expect(result.warnings).toEqual([
      'monster "?": monster without a name skipped',
      'monster "Test Beast": "Bite": unknown recharge code "WEIRD"',
      'unknown element <widget> skipped',
      'spell "Blank Spell": missing or unreadable level "x"',
    ]);
    const beast = result.records[0];
    expect(beast?.kind === 'monster' && beast.data.isNpc).toBe(true);
    expect(beast?.kind === 'monster' && beast.data.xp).toBe(25);
  });

  it('aggregates missing-field warnings and accepts to-hit-only triples', () => {
    const xml = `<compendium version="5">
      <monster><name>Cart</name><size>L</size><type>vehicle</type><ac>11</ac><hp>30</hp><speed>0 ft.</speed></monster>
      <monster><name>Wagon</name><size>L</size><type>vehicle</type><ac>11</ac><hp>30</hp><speed>0 ft.</speed><cr>1</cr></monster>
      <monster><name>Caster</name><size>M</size><type>humanoid</type><ac>12</ac><hp>20</hp><speed>30 ft.</speed>
        <str>10</str><dex>10</dex><con>10</con><int>16</int><wis>10</wis><cha>10</cha><cr>2</cr>
        <trait><name>Proficiency Bonus</name><text>equals your proficiency bonus</text></trait>
        <action><name>Spellcasting</name><text>Casts spells.</text><attack>Spellcasting|+5|</attack></action>
        <action><name>Age</name><text>Ages the target.</text><attack>Years||1d4x10</attack></action>
        <legendary><name>Blast</name><text>One blast.</text></legendary>
      </monster>
    </compendium>`;
    const result = parseCompendiumXml(xml, options);
    expect(result.warnings).toEqual([
      '2 monsters missing ability scores (Cart, Wagon)',
      '1 monster missing cr (Cart)',
    ]);
    const caster = result.records[2];
    expect(caster?.kind === 'monster' && caster.data.traits.map((t) => t.name)).toEqual([
      'Proficiency Bonus',
    ]);
    expect(caster?.kind === 'monster' && caster.data.proficiencyBonus).toBeUndefined();
    expect(caster?.kind === 'monster' && caster.data.actions[0]?.attacks).toEqual([
      { label: 'Spellcasting', toHit: 5, extraDamage: [] },
    ]);
    expect(caster?.kind === 'monster' && caster.data.actions[1]?.rolls).toEqual([
      { label: 'Years', dice: '1d4x10' },
    ]);
    expect(caster?.kind === 'monster' && caster.data.legendary.perTurn).toBe(3);
  });

  it('recovers from malformed XML inside one record', () => {
    const xml = `<compendium version="5">
      <feat><name>Good Feat</name><text>Fine.</text></feat>
      <feat><name>Broken & Feat</name><text>Bad ampersand.</text></feat>
      <feat><name>Another Feat</name><text>Also fine.</text></feat>
    </compendium>`;
    const result = parseCompendiumXml(xml, options);
    expect(result.records.map((r) => r.name)).toContain('Good Feat');
    expect(result.records.map((r) => r.name)).toContain('Another Feat');
    expect(result.warnings.some((w) => w.startsWith('XML error'))).toBe(true);
  });

  it('flags a non-compendium root but still reads what it can', () => {
    const result = parseCompendiumXml('<campaign version="5"><name>x</name></campaign>', options);
    expect(result.rootElement).toBe('campaign');
    expect(result.warnings[0]).toMatch(/root element is <campaign>/);
  });
});
