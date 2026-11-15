import { beforeEach, describe, expect, it } from 'vitest';
import type { CampaignBundle, TableIntent } from '@trifold/api';
import { Combatant, type NPC, type PCCard } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { blankNpc, blankPc } from '../campaign/CharacterEditors';
import { applyTableIntent } from './applyIntent';

const T = '2026-01-01T00:00:00.000Z';
const brannoc: PCCard = {
  ...blankPc(),
  id: 'b',
  name: 'Brannoc Hale',
  maxHp: 24,
  ac: 16,
  currentHp: 20,
};
const tobin: NPC = {
  ...blankNpc(),
  id: 'n',
  name: 'Tobin Marsh',
  hp: { current: 6, max: 9, temp: 0 },
  createdAt: T,
  updatedAt: T,
};

const fighter = (extra: Record<string, unknown> = {}) =>
  Combatant.parse({
    id: 'k',
    name: 'Brannoc Hale',
    maskedName: 'Brannoc Hale',
    ref: { kind: 'pc', pcId: 'b', name: 'Brannoc Hale' },
    role: 'ally',
    hp: { current: 20, max: 24, temp: 0 },
    ac: 16,
    ...extra,
  });

function openCampaign() {
  useCampaignStore.setState({
    current: {
      campaign: { id: 'c', slug: 'g' },
      pcs: [brannoc],
      npcs: [tobin],
      scenes: [],
    } as unknown as CampaignBundle,
  });
}

function fight(extra: Record<string, unknown> = {}) {
  useCombatStore.setState({
    encounterId: 'e',
    state: { round: 1, turnIndex: 0, combatants: [fighter(extra)], log: [], startedAt: T },
    pendingDamage: [],
  });
}

const apply = (intent: TableIntent, kind: 'pc' | 'npc' = 'pc', id = kind === 'pc' ? 'b' : 'n') =>
  applyTableIntent({ deviceLabel: 'Sam’s phone', creatureKind: kind, creatureId: id, intent });

const k = () => useCombatStore.getState().state!.combatants[0]!;
const lastSaved = <T>(fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.at(-1)?.[0] as T;

describe('applyTableIntent in the loaded fight', () => {
  beforeEach(() => {
    openCampaign();
    fight();
  });

  it('applies damage and healing as changes, so a DM’s hit and a player’s heal both count', () => {
    useCombatStore.getState().damage('k', 7); // the DM
    apply({ kind: 'hp', delta: 5 }); // the player
    expect(k().hp.current).toBe(18);
    apply({ kind: 'hp', delta: -3 });
    expect(k().hp.current).toBe(15);
  });

  it('names the device in the fight log', () => {
    apply({ kind: 'hp', delta: 5 });
    const log = useCombatStore.getState().state!.log;
    expect(log.at(-1)!.text).toMatch(/^Sam’s phone: /);
  });

  it('changes temp HP by the amount, never below 0', () => {
    apply({ kind: 'temp', delta: 5 });
    expect(k().hp.temp).toBe(5);
    apply({ kind: 'temp', delta: -9 });
    expect(k().hp.temp).toBe(0);
  });

  it('sets max HP and AC on the combatant and the PC card', () => {
    apply({ kind: 'maxHp', value: 18 });
    expect(k().hp).toMatchObject({ max: 18, current: 18 });
    expect(lastSaved<PCCard>(window.trifold.pcs.save as never)).toMatchObject({
      id: 'b',
      maxHp: 18,
    });
    apply({ kind: 'ac', value: 18 });
    expect(k().ac).toBe(18);
    expect(lastSaved<PCCard>(window.trifold.pcs.save as never)).toMatchObject({ ac: 18 });
  });

  it('adds and removes conditions', () => {
    apply({ kind: 'addCondition', name: 'Exhaustion', level: 2 });
    const added = k().conditions[0]!;
    expect(added).toMatchObject({ name: 'Exhaustion', level: 2 });
    apply({ kind: 'removeCondition', id: added.id });
    expect(k().conditions).toEqual([]);
  });

  it('takes initiative only while it is empty', () => {
    fight({ initiative: null });
    apply({ kind: 'initiative', value: 14 });
    expect(k().initiative).toBe(14);
    apply({ kind: 'initiative', value: 3 });
    expect(k().initiative).toBe(14);
  });
});

describe('applyTableIntent outside a fight', () => {
  beforeEach(() => {
    openCampaign();
    useCombatStore.setState({ encounterId: null, state: null });
  });

  it('changes the PC card’s HP within 0 and max', () => {
    apply({ kind: 'hp', delta: 10 });
    expect(lastSaved<PCCard>(window.trifold.pcs.save as never)).toMatchObject({ currentHp: 24 });
    apply({ kind: 'hp', delta: -99 });
    expect(lastSaved<PCCard>(window.trifold.pcs.save as never)).toMatchObject({ currentHp: 0 });
  });

  it('keeps current HP within a lowered max', () => {
    apply({ kind: 'maxHp', value: 12 });
    expect(lastSaved<PCCard>(window.trifold.pcs.save as never)).toMatchObject({
      maxHp: 12,
      currentHp: 12,
    });
  });

  it('changes an NPC’s carried HP', () => {
    apply({ kind: 'hp', delta: 2 }, 'npc');
    expect(lastSaved<NPC>(window.trifold.npcs.save as never)).toMatchObject({
      hp: { current: 8, max: 9 },
    });
  });
});
