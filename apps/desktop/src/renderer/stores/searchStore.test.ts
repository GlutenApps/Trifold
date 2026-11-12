import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CompendiumSuggestion, CompendiumTextHit } from '@trifold/api';
import { useCampaignStore } from './campaignStore';
import { useShellStore } from './shellStore';
import { useNavStore } from '../navigate';
import {
  flattenGroups,
  fromSuggestion,
  groupResults,
  searchCampaigns,
  searchLocal,
  searchMentions,
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

describe('searchCampaigns', () => {
  it('searches every campaign and says which one each row is in', () => {
    const other = bundle();
    other.campaign = { ...other.campaign, id: 'c2', name: 'Brinewood' };
    const results = searchCampaigns('hesper', [bundle(), other]);
    const npcs = results.filter((r) => r.group === 'npcs');
    expect(npcs.map((r) => [r.key, r.detail, r.campaignId])).toEqual([
      ['c1:npc:npc1', 'Greyford · Innkeeper · Greyford', 'c1'],
      ['c2:npc:npc1', 'Brinewood · Innkeeper · Greyford', 'c2'],
    ]);
    expect(npcs[0]!.target).toEqual({ type: 'npc', id: 'npc1' });
    expect(results.some((r) => r.group === 'webTabs')).toBe(false);
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

describe('searchMentions', () => {
  function withText(): CampaignBundle {
    const b = bundle();
    const notes = b.notes as unknown as Array<Record<string, unknown>>;
    notes[1]!.body = '**Hesper** keeps the lamp lit. Nobody trusts Hesper. hesper again.';
    notes.push({
      id: 'n3',
      kind: 'note',
      title: 'Bridge',
      parentId: null,
      order: 2,
      body: 'Hesper waits at the bridge.',
    });
    (b.encounters[0] as unknown as Record<string, unknown>).notes =
      'If Hesper runs, the bandits scatter.';
    (b.npcs[0] as unknown as Record<string, unknown>).notes = 'Owes the guild.';
    return b;
  }

  it('finds the phrase in note bodies and DM notes, most mentions first, with an anchor to land on', () => {
    const results = searchMentions('hesper', withText());
    expect(results.map((r) => [r.title, r.weight])).toEqual([
      ['Hesper’s letter', 3],
      ['Bridge', 1],
      ['Ambush at the bridge', 1],
    ]);
    const letter = results[0]!;
    expect(letter).toMatchObject({
      key: 'mention:note:n1',
      group: 'mentions',
      detail: '3 mentions · Note · Part 1',
      target: { type: 'note', id: 'n1', anchor: { phrase: 'hesper', occurrence: 0 } },
    });
    // Markdown is stripped before matching, so the snippet reads as the editor shows it.
    expect(letter.snippet).toMatchObject({ before: '', match: 'Hesper' });
    expect(letter.snippet!.after).toMatch(/^ keeps the lamp/);
    expect(results[2]!.target).toEqual({
      type: 'encounter',
      id: 'e1',
      anchor: { field: 'notes', phrase: 'hesper', occurrence: 0 },
    });
    // NPC notes are searched too.
    expect(searchMentions('guild', withText())[0]).toMatchObject({
      title: 'Hesper',
      detail: '1 mention · NPC notes',
      target: { type: 'npc', id: 'npc1' },
    });
  });

  it('waits for two characters and lists a note under both Notes and Mentioned in', () => {
    expect(searchMentions('h', withText())).toEqual([]);
    useCampaignStore.setState({ current: withText() });
    useSearchStore.getState().setQuery('bridge');
    const groups = useSearchStore.getState().groups();
    const notes = groups.find((g) => g.group === 'notes')!;
    const mentions = groups.find((g) => g.group === 'mentions');
    expect(notes.results.map((r) => r.key)).toContain('note:n3');
    expect(mentions?.results.map((r) => r.key)).toEqual(['mention:note:n3']);
    useSearchStore.getState().clear();
  });
});

describe('searchMentions on a large campaign', () => {
  it('stays inside the 50 ms search budget per keystroke once bodies are read', () => {
    const b = bundle();
    const paragraph =
      'The **party** reached the ford at dusk. [Hesper](x) had warned them about the toll. ';
    b.notes = Array.from({ length: 800 }, (_, i) => ({
      id: `big${i}`,
      kind: 'note',
      title: `Session ${i}`,
      parentId: null,
      order: i,
      body: paragraph.repeat(40),
    })) as unknown as CampaignBundle['notes'];
    searchMentions('warm up', b);
    const started = performance.now();
    for (const q of ['fo', 'for', 'ford', 'ford a', 'ford at']) searchMentions(q, b);
    expect((performance.now() - started) / 5).toBeLessThan(50);
    expect(searchMentions('toll', b)).toHaveLength(800);
  });
});

describe('Show all and compendium text', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useShellStore.setState({ space: 'console', webTabs: [], pop: null });
    useSearchStore.getState().clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    useSearchStore.getState().clear();
  });

  const hit = (i: number) =>
    ({
      id: `r${i}`,
      kind: 'monster',
      key: `m${i}`,
      name: `Beast ${i}`,
      displayName: `Beast ${i}`,
      sourceId: 'srd',
      sourceName: 'SRD',
      edition: '2024',
      editions: ['2024'],
      cr: '1',
      type: 'beast',
      size: 'M',
      environment: null,
      isNpc: false,
      level: null,
      typeCode: null,
      rarity: null,
      snippet: { before: '…lives in the ', match: 'swamp', after: ' at night…' },
    }) as unknown as CompendiumTextHit;

  it('lists record text hits in the index order, under their own group, with a snippet', async () => {
    useCampaignStore.setState({ current: bundle() });
    window.trifold.compendium.searchText = vi.fn(async () => [hit(2), hit(1)]);
    useSearchStore.getState().setQuery('swamp');
    await vi.advanceTimersByTimeAsync(100);
    expect(window.trifold.compendium.searchText).toHaveBeenCalledWith('swamp', {
      limit: 12,
      preferEdition: '2024',
    });
    const group = useSearchStore
      .getState()
      .groups()
      .find((g) => g.group === 'compendiumText')!;
    expect(group.label).toBe('Compendium text');
    expect(group.results.map((r) => r.title)).toEqual(['Beast 2', 'Beast 1']);
    expect(group.results[0]).toMatchObject({
      key: 'mention:record:r2',
      target: { type: 'record', id: 'r2' },
      snippet: { match: 'swamp' },
    });
  });

  it('shows one group in full, asks the index for more, and goes back', async () => {
    const many = bundle();
    many.npcs = Array.from({ length: 9 }, (_, i) => ({
      id: `g${i}`,
      name: `Guard ${i}`,
      role: '',
      location: '',
      isAlive: true,
    })) as unknown as CampaignBundle['npcs'];
    useCampaignStore.setState({ current: many });
    const texts = Array.from({ length: 12 }, (_, i) => hit(i));
    window.trifold.compendium.searchText = vi.fn(async (_t: string, o?: { limit?: number }) =>
      o?.limit === 100 ? texts.concat(Array.from({ length: 30 }, (_, i) => hit(100 + i))) : texts,
    );
    const store = useSearchStore.getState();
    store.setQuery('guard');
    await vi.advanceTimersByTimeAsync(100);
    let groups = useSearchStore.getState().groups();
    const npcs = groups.find((g) => g.group === 'npcs')!;
    expect(npcs.results).toHaveLength(6);
    expect(npcs.more).toBe(3);
    // Twelve text hits came back at the limit: there may be more than counted.
    expect(groups.find((g) => g.group === 'compendiumText')!.capped).toBe(true);

    store.setExpanded('npcs');
    groups = useSearchStore.getState().groups();
    expect(groups.map((g) => g.group)).toEqual(['npcs']);
    expect(groups[0]!.results).toHaveLength(9);
    expect(groups[0]!.more).toBe(0);

    useSearchStore.getState().setExpanded('compendiumText');
    await vi.advanceTimersByTimeAsync(100);
    expect(window.trifold.compendium.searchText).toHaveBeenLastCalledWith('guard', {
      limit: 100,
      preferEdition: '2024',
    });
    groups = useSearchStore.getState().groups();
    expect(groups.map((g) => g.group)).toEqual(['compendiumText']);
    expect(groups[0]!.results).toHaveLength(42);

    useSearchStore.getState().setExpanded(null);
    expect(useSearchStore.getState().groups().length).toBeGreaterThan(1);
  });
});
