import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import { Combatant, type CombatState, type Scene, type Token } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { dismissSummon, installSummonUpkeep, keepSummon, spawnSummons } from './summons';

const T = '2026-01-01T00:00:00.000Z';
const brannoc: Token = {
  id: 'tb',
  kind: 'pc',
  ref: { kind: 'pc', pcId: 'b', name: 'Brannoc Hale' },
  label: 'Brannoc Hale',
  x: 5,
  y: 5,
  footprint: 1,
  role: 'ally',
  hidden: false,
  nameMasked: false,
  dead: false,
};
const owlRef = { recordId: 'owl', sourceId: 'srd', key: 'owl', edition: '2024' as const };

function scene(tokens: Token[]): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    kind: 'blankGrid',
    title: 'Bridge',
    subtitle: '',
    showTitleOverride: null,
    parentId: null,
    order: 0,
    notes: '',
    tokens,
    entryMarkers: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
    createdAt: T,
    updatedAt: T,
  };
}

function setUp(tokens: Token[] = [brannoc]) {
  const s = scene(tokens);
  useCampaignStore.setState({
    current: {
      campaign: {
        id: 'c',
        slug: 'g',
        name: 'G',
        settings: {
          tokenStyle: 'engraved',
          summonable: [{ ref: owlRef, name: 'Owl', type: 'Beast', size: 'T', ac: 11, hp: 1 }],
        },
      },
      pcs: [],
      npcs: [],
      scenes: [s],
    } as unknown as CampaignBundle,
  });
  useSceneStore.setState({ selectedId: null, draft: null });
  usePresenterStore.getState().showScene(s, 'g');
}

const request = {
  kind: 'spawn' as const,
  deviceLabel: 'Sam’s phone',
  ownerKind: 'pc' as const,
  ownerId: 'b',
  optionKey: 'owl',
  count: 1,
  initiative: 'shared' as const,
  concentration: false,
  persistent: false,
};

const lastSavedScene = () =>
  (window.trifold.scenes.save as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(
    -1,
  )?.[0] as Scene | undefined;

describe('spawnSummons', () => {
  beforeEach(() => {
    useCombatStore.setState({ encounterId: null, state: null });
    setUp();
  });

  it('places a summon beside its owner, with its owner and device on it', async () => {
    expect(await spawnSummons(request)).toBe(1);
    const owl = lastSavedScene()!.tokens.find((t) => t.summon)!;
    expect(owl).toMatchObject({
      label: 'Owl',
      role: 'ally',
      ref: { kind: 'record', ref: owlRef },
      summon: {
        ownerKind: 'pc',
        ownerId: 'b',
        spawnedBy: 'Sam’s phone',
        hp: { current: 1, max: 1 },
        ac: 11,
      },
    });
    expect(Math.max(Math.abs(owl.x - 5), Math.abs(owl.y - 5))).toBe(1);
  });

  it('numbers several, and places nothing when the owner is not on the map', async () => {
    await spawnSummons({ ...request, count: 3 });
    expect(
      lastSavedScene()!
        .tokens.filter((t) => t.summon)
        .map((t) => t.label),
    ).toEqual(['Owl 1', 'Owl 2', 'Owl 3']);
    setUp([]);
    expect(await spawnSummons(request)).toBe(0);
  });

  it('joins the loaded fight on its owner’s turn, without touching the encounter', async () => {
    const owner = Combatant.parse({
      id: 'k',
      name: 'Brannoc Hale',
      maskedName: 'Brannoc Hale',
      ref: { kind: 'pc', pcId: 'b', name: 'Brannoc Hale' },
      role: 'ally',
      hp: { current: 20, max: 24, temp: 0 },
      initiative: 15,
      tokenId: 'tb',
    });
    useCombatStore.setState({
      encounterId: 'e',
      state: { round: 2, turnIndex: 0, combatants: [owner], log: [], startedAt: T } as CombatState,
      pendingDamage: [],
    });
    const addSummon = vi.spyOn(useCombatStore.getState(), 'addSummon').mockResolvedValue();
    await spawnSummons({ ...request, rounds: 3 });
    expect(addSummon).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Owl' }),
      15,
      'Sam’s phone',
    );
    expect(lastSavedScene()!.tokens.find((t) => t.summon)!.summon!.expiresAtRound).toBe(5);
    addSummon.mockRestore();
  });
});

describe('summons leaving play', () => {
  const owlToken = (extra: Partial<NonNullable<Token['summon']>> = {}): Token => ({
    ...brannoc,
    id: 'to',
    kind: 'creature',
    ref: { kind: 'record', ref: owlRef, name: 'Owl' },
    label: 'Owl',
    x: 6,
    summon: {
      ownerKind: 'pc',
      ownerId: 'b',
      spawnedBy: 'Sam’s phone',
      type: 'Beast',
      hp: { current: 1, max: 1, temp: 0 },
      ac: 11,
      initiative: 'shared',
      concentration: false,
      concentrationLost: false,
      persistent: false,
      ...extra,
    },
  });

  it('dismisses a summon: its token goes', () => {
    useCombatStore.setState({ encounterId: null, state: null });
    setUp([brannoc, owlToken()]);
    dismissSummon('to', 'is dismissed');
    expect(lastSavedScene()!.tokens.map((t) => t.id)).toEqual(['tb']);
  });

  it('keeps a summon after concentration: the question goes away', () => {
    setUp([brannoc, owlToken({ concentration: true, concentrationLost: true })]);
    keepSummon('to');
    expect(lastSavedScene()!.tokens.find((t) => t.id === 'to')!.summon!.concentrationLost).toBe(
      false,
    );
  });

  it('runs upkeep: rounds run out, concentration breaks, and the fight end takes non-staying summons', () => {
    const owner = Combatant.parse({
      id: 'k',
      name: 'Brannoc Hale',
      maskedName: 'Brannoc Hale',
      ref: { kind: 'pc', pcId: 'b', name: 'Brannoc Hale' },
      role: 'ally',
      hp: { current: 20, max: 24, temp: 0 },
      concentrating: { on: 'Find familiar', since: 1 },
    });
    const fight = (round: number, concentrating: boolean) =>
      ({
        round,
        turnIndex: 0,
        combatants: [{ ...owner, concentrating: concentrating ? owner.concentrating : null }],
        log: [],
        startedAt: T,
      }) as CombatState;
    setUp([
      brannoc,
      owlToken({ concentration: true }),
      { ...owlToken({ expiresAtRound: 3 }), id: 'tw', label: 'Wisp' },
      { ...owlToken({ persistent: true }), id: 'tf', label: 'Familiar' },
    ]);
    useCombatStore.setState({ encounterId: 'e', state: fight(2, true), finished: null });
    const off = installSummonUpkeep();

    useCombatStore.setState({ state: fight(3, true) });
    expect(lastSavedScene()!.tokens.map((t) => t.id)).not.toContain('tw');

    useCombatStore.setState({ state: fight(3, false) });
    expect(lastSavedScene()!.tokens.find((t) => t.id === 'to')!.summon!.concentrationLost).toBe(
      true,
    );

    useCombatStore.setState({
      state: null,
      finished: {
        encounterId: 'e',
        result: { endedAt: T, rounds: 3, xpEarned: 0, casualties: [], log: [] },
      },
    });
    const left = lastSavedScene()!.tokens.map((t) => t.id);
    expect(left).toContain('tf');
    expect(left).not.toContain('to');
    off();
  });
});
