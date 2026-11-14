import type { Combatant, CombatantTemplate } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import {
  retargetCombatants,
  retargetToNpc,
  retargetToRecord,
  templateTokenIds,
  withTokenLink,
  type RecordTarget,
} from './templates';

const goblins: CombatantTemplate = {
  id: 'g',
  ref: { kind: 'custom', name: 'Goblin' },
  quantity: 3,
  role: 'enemy',
  hidden: false,
  tokenIds: ['t1', 't2', 't3'],
  cache: { xp: 50, cr: '1/4', type: 'humanoid', hp: 7, ac: 15 },
};
const ogre: CombatantTemplate = {
  id: 'o',
  ref: { kind: 'custom', name: 'Ogre' },
  quantity: 1,
  role: 'enemy',
  hidden: true,
  tokenId: 'old',
};

describe('withTokenLink', () => {
  it('writes a lone template’s token and a numbered creature’s own slot', () => {
    const linked = withTokenLink([goblins, ogre], { templateId: 'o', name: 'Ogre' }, 'new');
    expect(linked[1]).toMatchObject({ tokenId: 'new' });
    const second = withTokenLink(linked, { templateId: 'g', name: 'Goblin 2' }, 'fresh');
    expect(second[0]!.tokenIds).toEqual(['t1', 'fresh', 't3']);
    const untied = withTokenLink(second, { templateId: 'o', name: 'Ogre' }, null);
    expect(untied[1]!.tokenId).toBeUndefined();
  });

  it('leaves templates alone for a combatant it cannot place', () => {
    expect(withTokenLink([goblins], { name: 'Goblin 1' }, 'x')).toEqual([goblins]);
    expect(withTokenLink([goblins], { templateId: 'g', name: 'Grak' }, 'x')).toEqual([goblins]);
  });
});

describe('retargetToNpc', () => {
  const npc = { id: 'npc1', name: 'Grak' };

  it('retargets a lone template and keeps its token', () => {
    const out = retargetToNpc([ogre], 'o', npc);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'o',
      ref: { kind: 'npc', npcId: 'npc1', name: 'Grak' },
      quantity: 1,
      hidden: true,
      tokenId: 'old',
    });
  });

  it('splits one creature out of a group, taking its token and the cached values', () => {
    const out = retargetToNpc([goblins, ogre], 'g', npc, 't2');
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ id: 'g', quantity: 2, tokenIds: ['t1', 't3'] });
    expect(out[1]).toMatchObject({
      ref: { kind: 'npc', npcId: 'npc1' },
      quantity: 1,
      tokenId: 't2',
      cache: goblins.cache,
    });
    expect(out[2]).toBe(ogre);
    // Without a token in hand the last placed one goes with the NPC.
    expect(retargetToNpc([goblins], 'g', npc)[1]).toMatchObject({ tokenId: 't3' });
  });

  it('appends a template when none matches', () => {
    expect(retargetToNpc([ogre], undefined, npc)[1]).toMatchObject({ ref: { kind: 'npc' } });
  });
});

describe('retargetToRecord and retargetCombatants', () => {
  const target: RecordTarget = {
    ref: {
      kind: 'record',
      ref: { recordId: 'homebrew:monster:1', sourceId: 'homebrew', key: 'grik', edition: '2024' },
      name: 'Grik',
    },
    cache: { xp: 100, cr: '1/2', type: 'humanoid', hp: 12, ac: 16 },
  };
  const row: CombatantTemplate = {
    ...goblins,
    ref: {
      kind: 'record',
      ref: { recordId: 'srd:goblin', sourceId: 'srd', key: 'goblin', edition: '2024' },
      name: 'Goblin',
    },
    label: 'Grik’s gang',
    hpOverride: 12,
  };

  it('points the whole row at the new record, keeping its label, count and tokens', () => {
    const [moved, other] = retargetToRecord([row, ogre], 'g', target);
    expect(moved).toMatchObject({
      ref: target.ref,
      cache: target.cache,
      label: 'Grik’s gang',
      quantity: 3,
      tokenIds: ['t1', 't2', 't3'],
    });
    expect(moved!.hpOverride).toBeUndefined();
    expect(other).toBe(ogre);
    expect(templateTokenIds(moved!)).toEqual(['t1', 't2', 't3']);
    expect(templateTokenIds(ogre)).toEqual(['old']);
  });

  it('switches the row’s fighters and keeps what the fight did to them', () => {
    const fighter = {
      id: 'c1',
      templateId: 'g',
      name: 'Goblin 1',
      ref: row.ref,
      recordId: 'srd:goblin',
      hp: { current: 3, max: 12, temp: 0 },
      conditions: [{ id: 'x', name: 'Prone' }],
    } as unknown as Combatant;
    const stranger = { ...fighter, id: 'c2', templateId: 'o' } as Combatant;
    const [switched, kept] = retargetCombatants([fighter, stranger], 'g', target);
    expect(switched).toMatchObject({
      ref: target.ref,
      recordId: 'homebrew:monster:1',
      hp: { current: 3, max: 12 },
      name: 'Goblin 1',
    });
    expect(switched!.conditions).toHaveLength(1);
    expect(kept).toBe(stranger);
  });
});
