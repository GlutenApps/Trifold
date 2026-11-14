import { beforeEach, describe, expect, it } from 'vitest';
import type { Combatant, Encounter, NPC, Scene } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { withoutFighters } from '../encounters/templates';
import { deleteNpcQuestion } from './CampaignPage';
import { planRemoval, statBlockFate, usesOf } from './npcRemoval';

/** Deleting an NPC (ADR 0037): where it is used, and whether its stat block goes with it. */
const npc = (id: string, name: string, recordId?: string, sourceId = 'campaign:silt') =>
  ({
    id,
    name,
    ...(recordId ? { recordRef: { recordId, sourceId, key: 'k', edition: '2024' } } : {}),
  }) as NPC;

const dragon = npc('n1', 'Brass Dragon', 'creature:monster:1');
const byNpc = { kind: 'npc' as const, npcId: 'n1', name: 'Brass Dragon' };
const byRecord = {
  kind: 'record' as const,
  ref: { recordId: 'creature:monster:1', sourceId: 'campaign:silt', key: 'k', edition: '2024' },
  name: 'Brass Dragon',
};
const goblin = {
  kind: 'record' as const,
  ref: { recordId: 'srd:goblin', sourceId: 'srd', key: 'goblin', edition: '2024' },
  name: 'Goblin',
};
const fighter = (id: string, ref: unknown) => ({ id, ref }) as unknown as Combatant;

const encounters = [
  {
    id: 'e1',
    combatants: [
      { id: 't1', ref: byNpc },
      { id: 't2', ref: goblin },
    ],
    state: {
      combatants: [fighter('g1', goblin), fighter('d1', byRecord), fighter('g2', goblin)],
      turnIndex: 2,
    },
  },
  { id: 'e2', combatants: [{ id: 't3', ref: goblin }] },
] as unknown as Encounter[];
const scenes = [
  {
    id: 's1',
    tokens: [
      { id: 'k1', kind: 'creature', ref: byRecord },
      { id: 'k2', kind: 'creature', ref: goblin },
    ],
  },
] as unknown as Scene[];

describe('statBlockFate', () => {
  it('deletes only a stat block that is this campaign’s alone', () => {
    const campaign = { slug: 'silt', npcs: [dragon] };
    expect(statBlockFate(dragon, campaign)).toEqual({
      creatureId: 'creature:monster:1',
      sharedWith: null,
    });
    // Shared with another NPC here: it stays.
    const twin = npc('n2', 'Brass Twin', 'creature:monster:1');
    expect(statBlockFate(dragon, { slug: 'silt', npcs: [dragon, twin] })).toEqual({
      creatureId: null,
      sharedWith: 'Brass Twin',
    });
    // The SRD, a file or homebrew is never touched; neither is another campaign's creature.
    expect(statBlockFate(npc('n3', 'Bandit', 'srd:bandit', 'srd'), campaign).creatureId).toBeNull();
    expect(
      statBlockFate(npc('n4', 'Old', 'creature:monster:9', 'campaign:other'), campaign).creatureId,
    ).toBeNull();
    expect(statBlockFate(npc('n5', 'Marla'), campaign).creatureId).toBeNull();
  });
});

describe('planRemoval', () => {
  it('takes the NPC and its stat block out of rows, fights and tokens, counting each', () => {
    const plan = planRemoval({ encounters, scenes }, usesOf('n1', 'creature:monster:1'));
    expect(plan).toMatchObject({ rowEncounters: 1, rows: 1, fights: 1, tokens: 1 });
    expect(plan.encounters.map((e) => e.id)).toEqual(['e1']);
    expect(plan.encounters[0]?.combatants.map((t) => t.id)).toEqual(['t2']);
    // The turn stays on the same goblin.
    expect(plan.encounters[0]?.state).toMatchObject({ turnIndex: 1 });
    expect(plan.encounters[0]?.state?.combatants.map((c) => c.id)).toEqual(['g1', 'g2']);
    expect(plan.scenes[0]?.tokens.map((t) => t.id)).toEqual(['k2']);
  });

  it('leaves the stat block’s other uses when only the NPC goes', () => {
    const plan = planRemoval({ encounters, scenes }, usesOf('n1', null));
    expect(plan).toMatchObject({ rows: 1, fights: 0, tokens: 0 });
  });

  it('keeps the turn in range when the last fighter goes', () => {
    const state = { combatants: [fighter('g1', goblin), fighter('d1', byNpc)], turnIndex: 1 };
    expect(withoutFighters(state, usesOf('n1', null)).turnIndex).toBe(0);
  });
});

describe('deleteNpcQuestion', () => {
  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c', name: 'Silt', slug: 'silt' },
        npcs: [dragon],
        encounters,
        scenes,
      } as never,
    });
  });

  it('says where it is used and that its stat block goes too', () => {
    expect(deleteNpcQuestion(dragon)).toBe(
      'Brass Dragon is in 1 encounter, 1 fight and 1 token. Delete Brass Dragon and its stat block and take it out of them?',
    );
    const marla = npc('n9', 'Marla');
    expect(deleteNpcQuestion(marla)).toBe('Delete Marla?');
  });
});
