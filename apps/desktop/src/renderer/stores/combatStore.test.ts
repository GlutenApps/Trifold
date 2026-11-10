import type { CampaignBundle } from '@trifold/api';
import type { Combatant, Encounter, Feature, Scene, Token } from '@trifold/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignStore } from './campaignStore';
import { useCombatStore } from './combatStore';
import { useSceneStore } from './sceneStore';

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

describe('the fight and the map (ADR 0012)', () => {
  const now = '2026-09-28T00:00:00.000Z';
  const wolfToken: Token = {
    id: 'w1',
    kind: 'creature',
    ref: { kind: 'custom', name: 'wolf' },
    label: 'wolf',
    x: 2,
    y: 2,
    footprint: 1,
    role: 'enemy',
    hidden: false,
    nameMasked: true,
    dead: false,
  };
  const cave: Scene = {
    schemaVersion: 1,
    id: 's1',
    kind: 'blankGrid',
    title: 'Cave',
    subtitle: '',
    showTitleOverride: null,
    parentId: null,
    order: 0,
    notes: '',
    blank: { cols: 10, rows: 10 },
    tokens: [wolfToken],
    entryMarkers: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
  const enc: Encounter = {
    schemaVersion: 1,
    id: 'enc',
    name: 'Cave fight',
    sceneId: 's1',
    combatants: [
      {
        id: 't-wolf',
        ref: { kind: 'custom', name: 'wolf' },
        quantity: 1,
        role: 'enemy',
        hidden: false,
      },
    ],
    notes: '',
    state: null,
    results: [],
    createdAt: now,
    updatedAt: now,
  };
  const savedScene = () => useCampaignStore.getState().current!.scenes.find((s) => s.id === 's1')!;

  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', slug: 'cave', settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        npcs: [],
        encounters: [enc],
        scenes: [cave],
      } as unknown as CampaignBundle,
    });
    useSceneStore.setState({ selectedId: null, draft: null });
    useCombatStore.setState({
      state: {
        ...useCombatStore.getState().state!,
        combatants: [
          combatant('wolf', { tokenId: 'w1' }),
          combatant('thora', { ref: { kind: 'pc', pcId: 'p', name: 'Thora' }, role: 'ally' }),
        ],
      },
    });
  });

  it('hiding or killing a combatant reaches its token on the map', async () => {
    useCombatStore.getState().toggleHidden('wolf');
    await vi.waitFor(() => expect(savedScene().tokens[0]!.hidden).toBe(true));
    useCombatStore.getState().markDead('wolf', true);
    await vi.waitFor(() => expect(savedScene().tokens[0]!.dead).toBe(true));
    // A draft of that scene (open in the editor) takes the change instead of the saved copy.
    useSceneStore.setState({ selectedId: 's1', draft: savedScene() });
    useCombatStore.getState().toggleHidden('wolf');
    expect(useSceneStore.getState().draft!.tokens[0]!.hidden).toBe(false);
  });

  it('linking a token hands it the fight’s flags and remembers it on the template', async () => {
    useCombatStore.setState({
      state: {
        ...useCombatStore.getState().state!,
        combatants: [combatant('wolf', { hidden: true, templateId: 't-wolf' })],
      },
    });
    useCombatStore.getState().linkToken('wolf', 'w1');
    expect(useCombatStore.getState().state!.combatants[0]!.tokenId).toBe('w1');
    await vi.waitFor(() => expect(savedScene().tokens[0]!.hidden).toBe(true));
    await vi.waitFor(() =>
      expect(window.trifold.encounters.save).toHaveBeenCalledWith(
        expect.objectContaining({
          combatants: [expect.objectContaining({ id: 't-wolf', tokenId: 'w1' })],
        }),
      ),
    );
    useCombatStore.getState().linkToken('wolf', null);
    expect(useCombatStore.getState().state!.combatants[0]!.tokenId).toBeUndefined();
  });

  it('relinks only what needs no judgement, and adds a stranger as a newcomer', async () => {
    const thoraToken: Token = {
      ...wolfToken,
      id: 'p-tok',
      kind: 'pc',
      ref: { kind: 'pc', pcId: 'p', name: 'Thora' },
      label: 'Thora',
    };
    const bear: Token = {
      ...wolfToken,
      id: 'b1',
      ref: { kind: 'custom', name: 'Bear' },
      label: 'Bear',
      hidden: true,
    };
    useCombatStore.getState().relinkTokens([wolfToken, thoraToken, bear]);
    const byId = (id: string) =>
      useCombatStore.getState().state!.combatants.find((c) => c.id === id)!;
    expect(byId('thora').tokenId).toBe('p-tok');

    await useCombatStore.getState().addFromToken(bear);
    const fighters = useCombatStore.getState().state!.combatants;
    expect(fighters.map((c) => c.name)).toEqual(['wolf', 'thora', 'Bear']);
    expect(fighters[2]).toMatchObject({ tokenId: 'b1', hidden: true, hp: { max: 1 } });
    await vi.waitFor(() =>
      expect(window.trifold.encounters.save).toHaveBeenCalledWith(
        expect.objectContaining({
          combatants: expect.arrayContaining([
            expect.objectContaining({ ref: { kind: 'custom', name: 'Bear' } }),
          ]),
        }),
      ),
    );
  });

  it('starts a fight from what the map in play shows, then drives it', async () => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', slug: 'cave', settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        npcs: [],
        encounters: [enc],
        scenes: [{ ...cave, tokens: [{ ...wolfToken, hidden: true }] }],
      } as unknown as CampaignBundle,
    });
    await useCombatStore.getState().begin(enc, [], 'perGroup');
    const wolf = useCombatStore.getState().state!.combatants[0]!;
    expect(wolf).toMatchObject({ name: 'wolf', tokenId: 'w1', hidden: true });
    useCombatStore.getState().toggleHidden(wolf.id);
    await vi.waitFor(() => expect(savedScene().tokens[0]!.hidden).toBe(false));
  });

  it('turns a creature into an NPC that carries its HP, splitting it from its template', async () => {
    useCombatStore.getState().damage('wolf', 5);
    const npc = await useCombatStore.getState().trackAsNpc('wolf');
    expect(npc).toMatchObject({
      name: 'wolf',
      isAlive: true,
      hp: { current: 15, max: 20, temp: 0 },
    });
    expect(useCombatStore.getState().state!.combatants[0]!.ref).toMatchObject({ kind: 'npc' });
    expect(await useCombatStore.getState().trackAsNpc('thora')).toBeNull();
  });
});

describe('adding to a running fight', () => {
  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', slug: 'cave', settings: { initiativeMode: 'perGroup' } },
        pcs: [
          { id: 'p', name: 'Thora', maxHp: 30, ac: 16, initiativeBonus: 2, saves: {} },
          { id: 'b', name: 'Bram', maxHp: 22, ac: 14, initiativeBonus: 0, saves: {} },
        ],
        npcs: [],
        encounters: [{ id: 'enc', combatants: [], results: [] }],
        scenes: [],
        counters: [],
        timers: [],
      } as unknown as CampaignBundle,
    });
    useCombatStore.setState({
      state: {
        ...useCombatStore.getState().state!,
        combatants: [
          combatant('wolf'),
          combatant('thora', { ref: { kind: 'pc', pcId: 'p', name: 'Thora' }, role: 'ally' }),
        ],
      },
    });
  });

  it('numbers newcomers after the ones already there and keeps them on the encounter', async () => {
    await useCombatStore.getState().addToFight({
      id: 't',
      ref: { kind: 'custom', name: 'wolf' },
      quantity: 2,
      role: 'enemy',
      hidden: false,
      cache: { xp: 50, cr: '1/4', type: 'beast', hp: 11, ac: 13 },
    });
    const names = useCombatStore.getState().state!.combatants.map((c) => c.name);
    expect(names).toEqual(['wolf', 'thora', 'wolf 2', 'wolf 3']);
    expect(useCombatStore.getState().state!.combatants[2]!.hp).toEqual({
      current: 11,
      max: 11,
      temp: 0,
    });
    await vi.waitFor(() =>
      expect(window.trifold.encounters.save).toHaveBeenCalledWith(
        expect.objectContaining({
          combatants: [expect.objectContaining({ id: 't', quantity: 2 })],
        }),
      ),
    );
  });

  it('adds a waiting PC from the card and leaves one already fighting alone', async () => {
    const pcTemplate = (pcId: string, name: string) =>
      ({
        id: `t-${pcId}`,
        ref: { kind: 'pc', pcId, name },
        quantity: 1,
        role: 'ally',
        hidden: false,
      }) as const;
    await useCombatStore.getState().addToFight(pcTemplate('p', 'Thora'));
    expect(useCombatStore.getState().state!.combatants).toHaveLength(2);
    await useCombatStore.getState().addToFight(pcTemplate('b', 'Bram'));
    const bram = useCombatStore.getState().state!.combatants.find((c) => c.name === 'Bram')!;
    expect(bram).toMatchObject({
      ref: { kind: 'pc', pcId: 'b' },
      hp: { max: 22 },
      initiative: null,
    });
  });
});
