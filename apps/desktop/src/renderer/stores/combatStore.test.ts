import type { Combatant, Feature } from '@trifold/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore } from './combatStore';

function combatant(id: string, extra: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    maskedName: id,
    revealed: true,
    ref: { kind: 'custom', name: id },
    role: 'enemy',
    initiative: 10,
    initiativeBonus: 0,
    dexterity: 10,
    hp: { current: 20, max: 20, temp: 0 },
    saves: {},
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    conditions: [],
    concentrating: null,
    counters: [],
    recharges: [],
    deathSaves: null,
    dead: false,
    hidden: false,
    held: false,
    isLair: false,
    ...extra,
  };
}

const bite: Feature = {
  name: 'Bite',
  displayName: 'Bite',
  text: '',
  tags: [],
  attacks: [
    {
      label: 'Bite',
      toHit: 4,
      damage: '2d4+2',
      damageType: 'piercing',
      extraDamage: [{ damage: '1d6', damageType: 'fire' }],
    },
  ],
  rolls: [],
  saves: [],
};

beforeEach(() => {
  useCombatStore.setState({
    encounterId: 'enc',
    state: {
      round: 1,
      turnIndex: 0,
      combatants: [
        combatant('wolf'),
        combatant('thora', {
          ref: { kind: 'pc', pcId: 'p', name: 'Thora' },
          role: 'ally',
          damageResistances: ['fire'],
        }),
      ],
      log: [],
      startedAt: '2026-09-28T00:00:00.000Z',
    },
    pendingDamage: [],
    selectedId: 'wolf',
  });
});

describe('rolled damage queue', () => {
  it('queues each attack roll with its damage parts, then applies them to a chosen target', () => {
    const store = useCombatStore.getState();
    store.rollAttackFor('wolf', bite, bite.attacks[0]!);
    const pending = useCombatStore.getState().pendingDamage;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      sourceId: 'wolf',
      sourceName: 'wolf',
      featureName: 'Bite',
      label: 'Bite',
    });
    expect(pending[0]?.hit?.total).toBeGreaterThanOrEqual(5);
    expect(pending[0]?.parts.map((p) => p.type)).toEqual(['piercing', 'fire']);
    const piercing = pending[0]!.parts[0]!.amount;
    const fire = pending[0]!.parts[1]!.amount;

    useCombatStore.getState().applyPendingDamage(pending[0]!.id, [{ id: 'thora', share: 'full' }]);
    const thora = useCombatStore.getState().state!.combatants[1]!;
    // Fire is resisted (halved, rounded down); piercing lands in full.
    expect(thora.hp.current).toBe(20 - piercing - Math.floor(fire / 2));
    expect(useCombatStore.getState().pendingDamage).toEqual([]);
    const log = useCombatStore.getState().state!.log.map((e) => e.text);
    expect(log.some((t) => t.includes('applied to thora'))).toBe(true);
  });

  it('halves on request and can be dismissed', () => {
    const store = useCombatStore.getState();
    store.rollAttackFor(
      'wolf',
      { ...bite, attacks: [] },
      { label: 'Claw', toHit: 4, damage: '10', extraDamage: [] },
    );
    const [p] = useCombatStore.getState().pendingDamage;
    expect(p?.parts).toEqual([{ amount: 10 }]);
    useCombatStore.getState().applyPendingDamage(p!.id, [{ id: 'thora', share: 'half' }]);
    expect(useCombatStore.getState().state!.combatants[1]!.hp.current).toBe(15);

    store.rollAttackFor('wolf', bite, bite.attacks[0]!);
    const [q] = useCombatStore.getState().pendingDamage;
    useCombatStore.getState().dismissPendingDamage(q!.id);
    expect(useCombatStore.getState().pendingDamage).toEqual([]);
  });
});

describe('damage to several targets', () => {
  it('gives each target its own share of one roll', () => {
    const store = useCombatStore.getState();
    useCombatStore.setState({
      state: {
        ...useCombatStore.getState().state!,
        combatants: [...useCombatStore.getState().state!.combatants, combatant('bandit')],
      },
    });
    store.rollAttackFor(
      'wolf',
      { ...bite, attacks: [] },
      { label: 'Breath', damage: '10', damageType: 'fire', extraDamage: [] },
    );
    const [p] = useCombatStore.getState().pendingDamage;
    useCombatStore.getState().applyPendingDamage(p!.id, [
      { id: 'thora', share: 'full' },
      { id: 'bandit', share: 'half' },
    ]);
    const [, thora, bandit] = useCombatStore.getState().state!.combatants;
    // Thora resists fire, so her full 10 lands as 5; the bandit's half share is 5.
    expect(thora!.hp.current).toBe(15);
    expect(bandit!.hp.current).toBe(15);
    const log = useCombatStore.getState().state!.log.map((e) => e.text);
    expect(log).toContain("wolf's Bite applied to thora, bandit (halved)");
  });

  it('applies a called save to the targets the DM picks, PCs included, then closes it', () => {
    useCombatStore.setState({
      saveCall: {
        id: 'call',
        sourceId: 'wolf',
        sourceName: 'wolf',
        featureName: 'Howl',
        ability: 'wis',
        dc: 12,
        halfOnSuccess: true,
        creatures: [],
        pcs: [{ id: 'thora', name: 'Thora', bonus: 2 }],
      },
    });
    useCombatStore.getState().applySaveDamage(9, 'psychic', [{ id: 'thora', share: 'half' }]);
    expect(useCombatStore.getState().state!.combatants[1]!.hp.current).toBe(16);
    expect(useCombatStore.getState().saveCall).toBeNull();
  });
});

describe('roll mode per roll', () => {
  it('rolls one attack with advantage and says so in the log', () => {
    useCombatStore.getState().rollAttackFor('wolf', bite, bite.attacks[0]!, 'advantage');
    const log = useCombatStore.getState().state!.log.map((e) => e.text);
    expect(log.at(-1)).toMatch(/^wolf — Bite \[Bite\] with advantage: to hit/);
    useCombatStore.getState().rollAttackFor('wolf', bite, bite.attacks[0]!);
    expect(useCombatStore.getState().state!.log.at(-1)!.text).toMatch(/^wolf — Bite \[Bite\]: /);
  });
});
