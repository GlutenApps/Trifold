import { parseCompendiumXml } from '@trifold/importers';
import type { Encounter, MonsterRecord, PCCard } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { buildCombatants, countersFromMonster } from './build';

const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });
const byId = new Map(records.map((r) => [r.id, r]));
const monster = (name: string): MonsterRecord => {
  const r = records.find((x) => x.kind === 'monster' && x.name === name);
  if (!r || r.kind !== 'monster') throw new Error(name);
  return r;
};

const pc: PCCard = {
  schemaVersion: 1,
  id: 'pc1',
  name: 'Thora',
  playerName: 'Sam',
  classText: 'Fighter',
  level: 5,
  maxHp: 44,
  ac: 18,
  initiativeBonus: 1,
  speed: 30,
  passives: { perception: 12, insight: 10, investigation: 10 },
  saves: { str: 6 },
  notes: '',
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
};

function encounter(overrides: Partial<Encounter> = {}): Encounter {
  const aboleth = monster('Aboleth');
  const goblin = monster('Goblin Warrior [5.5e]');
  return {
    schemaVersion: 1,
    id: 'e1',
    name: 'Test',
    notes: '',
    state: null,
    results: [],
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
    combatants: [
      {
        id: 't1',
        ref: { kind: 'pc', pcId: 'pc1', name: 'Thora' },
        quantity: 1,
        role: 'ally',
        hidden: false,
      },
      {
        id: 't2',
        ref: {
          kind: 'record',
          ref: { recordId: goblin.id, sourceId: 'src', key: goblin.key, edition: goblin.edition },
          name: 'Goblin Warrior',
        },
        quantity: 3,
        role: 'enemy',
        hidden: false,
      },
      {
        id: 't3',
        ref: {
          kind: 'record',
          ref: {
            recordId: aboleth.id,
            sourceId: 'src',
            key: aboleth.key,
            edition: aboleth.edition,
          },
          name: 'Aboleth',
        },
        quantity: 1,
        role: 'enemy',
        hidden: true,
      },
    ],
    ...overrides,
  };
}

describe('buildCombatants', () => {
  it('expands groups, numbers names, masks creatures, rolls group initiative and adds a lair entry', () => {
    const result = buildCombatants(encounter(), [pc], byId, {
      initiativeMode: 'perGroup',
      rng: () => 0.5,
    });
    expect(result.missing).toEqual([]);
    expect(result.hasLair).toBe(true);
    const names = result.combatants.map((c) => c.name);
    expect(names).toEqual([
      'Thora',
      'Goblin Warrior 1',
      'Goblin Warrior 2',
      'Goblin Warrior 3',
      'Aboleth',
      'Lair actions',
    ]);
    const thora = result.combatants[0]!;
    expect(thora).toMatchObject({
      initiative: null,
      initiativeBonus: 1,
      hp: { current: 44, max: 44 },
      ac: 18,
      revealed: true,
      role: 'ally',
    });
    const goblins = result.combatants.slice(1, 4);
    expect(goblins.every((g) => g.initiative === goblins[0]!.initiative)).toBe(true);
    expect(goblins[0]).toMatchObject({
      maskedName: 'Fey',
      hp: { max: 10 },
      ac: 15,
      initiativeBonus: 2,
      revealed: false,
    });
    const aboleth = result.combatants[4]!;
    expect(aboleth.hidden).toBe(true);
    expect(aboleth.initiativeBonus).toBe(-1);
    expect(aboleth.damageResistances).toEqual([]);
    expect(result.combatants[5]).toMatchObject({ isLair: true, initiative: 20 });
  });

  it('rolls per creature when asked and falls back to cached values for missing records', () => {
    let n = 0;
    const rng = () => [0.1, 0.9, 0.5][n++ % 3]!;
    const e = encounter({
      combatants: [
        {
          id: 'x',
          ref: {
            kind: 'record',
            ref: { recordId: 'gone', sourceId: 'src', key: 'gone', edition: '2014' },
            name: 'Vanished',
          },
          quantity: 2,
          role: 'enemy',
          hidden: false,
          cache: { xp: 50, cr: '1/4', type: 'undead', hp: 22, ac: 13 },
        },
        {
          id: 'y',
          ref: {
            kind: 'record',
            ref: { recordId: monster('Mage').id, sourceId: 'src', key: 'mage', edition: '2014' },
            name: 'Mage',
          },
          quantity: 2,
          role: 'enemy',
          hidden: false,
        },
      ],
    });
    const result = buildCombatants(e, [], byId, { initiativeMode: 'perCreature', rng });
    expect(result.missing).toEqual(['Vanished']);
    expect(result.combatants.slice(0, 2).map((c) => c.hp.max)).toEqual([22, 22]);
    expect(result.combatants[0]?.maskedName).toBe('Undead');
    const mages = result.combatants.slice(2);
    expect(mages[0]?.initiative).not.toBe(mages[1]?.initiative);
    expect(result.hasLair).toBe(false);
  });

  it('derives counters and recharges from features', () => {
    const { counters, recharges } = countersFromMonster(monster('Young Red Dragon'));
    expect(recharges).toEqual([
      expect.objectContaining({
        featureName: 'Fire Breath (Recharge 5–6)',
        min: 5,
        available: true,
      }),
    ]);
    expect(counters).toEqual([]);
    const aboleth = countersFromMonster(monster('Aboleth'));
    expect(aboleth.counters.map((c) => [c.name, c.max, c.resets, c.kind])).toEqual([
      ['Legendary actions', 3, 'turn', 'legendary'],
      ['Enslave', 3, 'day', 'uses'],
    ]);
  });
});
