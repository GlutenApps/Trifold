import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CompendiumSuggestion } from '@trifold/api';
import { useCampaignStore } from './campaignStore';
import { useShellStore } from './shellStore';
import { useNavStore } from '../navigate';
import {
  flattenGroups,
  fromSuggestion,
  groupResults,
  searchLocal,
  useSearchStore,
} from './searchStore';

const now = '2026-11-09T00:00:00.000Z';

function bundle(): CampaignBundle {
  return {
    campaign: {
      schemaVersion: 1,
      id: 'c1',
      slug: 'greyford',
      name: 'Greyford',
      preferredEdition: '2024',
      settings: {},
      createdAt: now,
      updatedAt: now,
    },
    pcs: [{ id: 'p1', name: 'Bram', playerName: 'Alex', classText: 'Fighter', level: 3 }],
    adventures: [],
    notes: [
      { id: 'f1', kind: 'folder', title: 'Part 1', parentId: null, order: 0 },
      { id: 'n1', kind: 'note', title: 'Hesper’s letter', parentId: 'f1', order: 0 },
      { id: 'n2', kind: 'note', title: 'Rumours', parentId: null, order: 1 },
    ],
    npcs: [{ id: 'npc1', name: 'Hesper', role: 'Innkeeper', location: 'Greyford', isAlive: true }],
    encounters: [
      {
        id: 'e1',
        name: 'Ambush at the bridge',
        combatants: [
          { id: 't1', ref: { kind: 'npc', npcId: 'npc1', name: 'Hesper' }, quantity: 1 },
          { id: 't2', ref: { kind: 'custom', name: 'Bandit' }, quantity: 3 },
        ],
      },
      { id: 'e2', name: 'Hesper confronted', combatants: [] },
    ],
    scenes: [
      { id: 's1', kind: 'map', title: 'The bridge', subtitle: 'Hesper waits here' },
      { id: 's2', kind: 'title', title: 'Greyford', subtitle: '' },
    ],
  } as unknown as CampaignBundle;
}

describe('searchLocal', () => {
  it('finds every type by name and ranks the exact NPC first', () => {
    const results = searchLocal('hesper', bundle(), [
      {
        id: 'w1',
        title: 'Hesper lore',
        url: 'https://example.test/x',
        autoTitle: false,
        icon: 'globe',
        zoom: 1,
      },
    ]);
    const groups = groupResults(results);
    expect(groups.map((g) => g.group)).toEqual([
      'notes',
      'npcs',
      'encounters',
      'scenes',
      'webTabs',
    ]);
    expect(groups[1]!.results[0]).toMatchObject({
      tier: 'exact',
      title: 'Hesper',
      detail: 'Innkeeper · Greyford',
      target: { type: 'npc', id: 'npc1' },
    });
    // An encounter counts a member's name, and says so; its own name match comes first.
    const encounters = groups[2]!.results;
    expect(encounters.map((r) => r.title)).toEqual(['Hesper confronted', 'Ambush at the bridge']);
    expect(encounters[1]).toMatchObject({ detail: 'with Hesper', tier: 'substring' });
    expect(groups[3]!.results[0]).toMatchObject({
      title: 'The bridge',
      detail: 'Map · Hesper waits here',
    });
    expect(groups[4]!.results[0]).toMatchObject({
      detail: 'example.test',
      target: { type: 'webTab', id: 'w1' },
    });
  });

  it('shows a note’s folder path and marks folders', () => {
    const results = searchLocal('part', bundle(), []);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'Part 1',
      detail: 'Folder',
      target: { type: 'folder', id: 'f1' },
    });
    const letter = searchLocal('letter', bundle(), [])[0]!;
    expect(letter.detail).toBe('Part 1');
    expect(letter.target).toEqual({ type: 'note', id: 'n1' });
  });

  it('matches a PC by player name and nothing on an empty query', () => {
    expect(searchLocal('alex', bundle(), [])[0]).toMatchObject({ title: 'Bram', group: 'party' });
    expect(searchLocal('', bundle(), [])).toEqual([]);
    expect(searchLocal('hesper', null, [])).toEqual([]);
  });
});

describe('groupResults', () => {
  it('caps each group and counts the rest, tiers first', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      key: `npc:${i}`,
      group: 'npcs' as const,
      title: `Guard ${i}`,
      detail: '',
      tier: i === 8 ? ('exact' as const) : ('substring' as const),
      icon: 'person' as const,
      target: { type: 'npc' as const, id: String(i) },
    }));
    const [group] = groupResults(many);
    expect(group!.results).toHaveLength(6);
    expect(group!.more).toBe(3);
    expect(group!.results[0]!.title).toBe('Guard 8');
    expect(flattenGroups(groupResults(many))).toHaveLength(6);
  });
});

describe('fromSuggestion', () => {
  const row = (patch: Partial<CompendiumSuggestion>): CompendiumSuggestion =>
    ({
      id: 'r1',
      kind: 'monster',
      key: 'goblin',
      name: 'Goblin',
      displayName: 'Goblin',
      sourceId: 'srd',
      sourceName: 'SRD 5.2.1',
      edition: '2024',
      editions: ['2024'],
      cr: '1/4',
      type: 'fey',
      size: 'S',
      environment: null,
      isNpc: false,
      level: null,
      typeCode: null,
      rarity: null,
      tier: 'exact',
      ...patch,
    }) as CompendiumSuggestion;

  it('labels the kind with its one useful fact and the source', () => {
    expect(fromSuggestion(row({})).detail).toBe('Monster · CR 1/4 · SRD 5.2.1');
    expect(fromSuggestion(row({ kind: 'spell', cr: null, level: 0 })).detail).toBe(
      'Spell · Cantrip · SRD 5.2.1',
    );
    expect(fromSuggestion(row({ kind: 'item', cr: null })).detail).toBe('Item · SRD 5.2.1');
    expect(fromSuggestion(row({})).target).toEqual({ type: 'record', id: 'r1' });
  });
});

describe('useSearchStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCampaignStore.setState({ current: bundle() });
    useShellStore.setState({ space: 'console', webTabs: [], pop: null });
    useNavStore.setState({ pending: null });
    useSearchStore.getState().clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ranks the campaign at once and asks the compendium after a pause, dropping stale answers', async () => {
    const suggest = vi.fn(async (text: string) => {
      const rows =
        text === 'he'
          ? []
          : [
              {
                id: 'r1',
                kind: 'monster',
                displayName: 'Hezrou',
                sourceName: 'SRD',
                tier: 'prefix',
                cr: '8',
                level: null,
                editions: ['2024'],
                edition: '2024',
              },
            ];
      return rows as unknown as CompendiumSuggestion[];
    });
    window.trifold.compendium.suggest = suggest;
    const store = useSearchStore.getState();
    store.setQuery('he');
    expect(useSearchStore.getState().local.some((r) => r.title === 'Hesper')).toBe(true);
    expect(useSearchStore.getState().loading).toBe(true);
    expect(suggest).not.toHaveBeenCalled();
    store.setQuery('hez');
    await vi.advanceTimersByTimeAsync(100);
    // Only the latest query reached main; the first was debounced away.
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('hez', { limit: 12, preferEdition: '2024' });
    expect(useSearchStore.getState().compendium.map((r) => r.title)).toEqual(['Hezrou']);
    expect(useSearchStore.getState().loading).toBe(false);
  });

  it('moves the active row across groups with wrap-around and opens it', () => {
    const store = useSearchStore.getState();
    store.setQuery('hesper');
    const flat = flattenGroups(store.groups());
    expect(flat.length).toBeGreaterThan(2);
    expect(store.active()?.key).toBe(flat[0]!.key);
    store.move(-1);
    expect(useSearchStore.getState().active()?.key).toBe(flat[flat.length - 1]!.key);
    store.move(1);
    expect(useSearchStore.getState().active()?.key).toBe(flat[0]!.key);
    store.move(1);
    expect(useSearchStore.getState().active()?.key).toBe(flat[1]!.key);
    expect(useSearchStore.getState().activate()).toBe(true);
    expect(useNavStore.getState().pending?.target).toEqual(flat[1]!.target);
  });

  it('clears, and starts clean when another campaign opens', () => {
    const store = useSearchStore.getState();
    store.setQuery('hesper');
    expect(useSearchStore.getState().local.length).toBeGreaterThan(0);
    store.clear();
    expect(useSearchStore.getState()).toMatchObject({
      query: '',
      local: [],
      compendium: [],
      loading: false,
    });
    store.setQuery('hesper');
    const other = bundle();
    other.campaign = { ...other.campaign, id: 'c2', slug: 'other' };
    useCampaignStore.setState({ current: other });
    expect(useSearchStore.getState().query).toBe('');
  });

  it('refreshes the campaign half when the bundle changes under an open query', () => {
    const store = useSearchStore.getState();
    store.setQuery('hesper');
    const current = useCampaignStore.getState().current!;
    useCampaignStore.setState({
      current: {
        ...current,
        npcs: [...current.npcs, { ...current.npcs[0]!, id: 'npc2', name: 'Hesper the younger' }],
      },
    });
    expect(useSearchStore.getState().local.filter((r) => r.group === 'npcs')).toHaveLength(2);
  });
});
