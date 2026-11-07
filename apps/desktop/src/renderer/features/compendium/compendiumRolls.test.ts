import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { useRollLogStore } from '../../stores/rollLogStore';
import { compendiumActions, logDiceRoll, logMultiattack } from './compendiumRolls';

const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });

function monster(name: string): MonsterRecord {
  const r = records.find((x) => x.kind === 'monster' && x.name === name);
  if (!r || r.kind !== 'monster') throw new Error(name);
  return r;
}

function feature(record: MonsterRecord, name: string) {
  const f = record.data.actions.find((x) => x.displayName === name);
  if (!f) throw new Error(name);
  return f;
}

describe('compendium rolls', () => {
  beforeEach(() => useRollLogStore.getState().clear());

  it('logs an attack with the record as the actor and nothing else tracked', () => {
    const goblin = monster('Goblin Warrior [5.5e]');
    const scimitar = feature(goblin, 'Scimitar');
    compendiumActions(goblin).onAttack(scimitar, scimitar.attacks[0]!, 'advantage');
    const [entry] = useRollLogStore.getState().entries;
    expect(entry).toMatchObject({ kind: 'attack', source: 'compendium', actor: 'Goblin Warrior' });
    expect(entry!.label).toContain('Scimitar');
    expect(entry!.label).toContain('(advantage)');
    expect(entry!.faces).toMatch(/to hit \d+ \(d20 \d+\/\d+/);
    expect(entry!.faces).toMatch(/slashing damage/);
  });

  it('rolls every attack named by Multiattack', () => {
    // The dragon's Multiattack names its bite and claws: two features, one attack each.
    const dragon = records.find(
      (r): r is MonsterRecord =>
        r.kind === 'monster' &&
        r.data.actions.some((a) => /^multiattack$/i.test(a.displayName) && /claws/.test(a.text)),
    );
    if (!dragon) throw new Error('fixture');
    const entries = logMultiattack(dragon, feature(dragon, 'Multiattack'));
    expect(entries.map((e) => e.label)).toEqual([
      expect.stringContaining('Bite'),
      expect.stringContaining('Claw'),
    ]);
    expect(useRollLogStore.getState().entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === 'attack' && e.actor === dragon.displayName)).toBe(true);
  });

  it('logs a plain dice roll for spell and trait pills', () => {
    const entry = logDiceRoll('Fireball', 'Fire damage (level 3)', '8d6');
    expect(entry.total).toBeGreaterThanOrEqual(8);
    expect(entry.total).toBeLessThanOrEqual(48);
    expect(entry).toMatchObject({ kind: 'dice', expression: '8d6', source: 'compendium' });
    expect(entry.label).toBe('Fire damage (level 3) (Fireball)');
  });
});
