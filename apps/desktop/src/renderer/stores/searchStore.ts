import { create } from 'zustand';
import type { CampaignBundle, CompendiumSuggestion, CompendiumTextHit } from '@trifold/api';
import {
  ancestorsOf,
  phraseSnippets,
  rankByName,
  stripMarkdown,
  TIER_RANK,
  type MatchTier,
  type SearchSnippet,
} from '@trifold/rules';
import {
  errorMessage,
  type Note,
  type RecordKind,
  type SceneKind,
  type WebTab,
} from '@trifold/schema';
import type { IconName } from '../features/shell/icons';
import { navigate, navKey, type NavTarget } from '../navigate';
import { useCampaignStore } from './campaignStore';
import { useShellStore } from './shellStore';

/**
 * Global search (ADR 0017): names and titles across the open campaign, the shell's web tabs and
 * the compendium, ranked exact, prefix, word, substring and grouped by type; and, under
 * Mentioned in, the phrase in the text of notes, encounter DM notes, NPC, PC and scene notes,
 * each with a snippet, opening at that occurrence (`searchMentions`). The campaign half
 * is ranked in memory on every keystroke (`searchLocal`, a pure function); the compendium half
 * asks main's SQLite index through `compendium.suggest` after a short debounce, and a stale
 * answer is dropped by sequence number. Picking a result goes through `navigate` and nothing
 * else. The store keeps the query and the active row; the field and the results pop-up in
 * features/shell/GlobalSearch.tsx render it.
 */
export type SearchGroup =
  | 'notes'
  | 'npcs'
  | 'party'
  | 'encounters'
  | 'scenes'
  | 'mentions'
  | 'compendium'
  | 'compendiumText'
  | 'webTabs';

export const GROUP_ORDER: readonly SearchGroup[] = [
  'notes',
  'npcs',
  'party',
  'encounters',
  'scenes',
  'mentions',
  'compendium',
  'compendiumText',
  'webTabs',
];

export const GROUP_LABELS: Record<SearchGroup, string> = {
  notes: 'Notes',
  npcs: 'NPCs',
  party: 'Party',
  encounters: 'Encounters',
  scenes: 'Scenes',
  mentions: 'Mentioned in',
  compendium: 'Compendium',
  compendiumText: 'Compendium text',
  webTabs: 'Web tabs',
};

/** Rows shown per group before "+N more". */
export const GROUP_LIMIT = 6;
/** Below this window width the search field lives in its pop-up, not the top bar. */
export const SEARCH_COMPACT_BELOW = 960;
/** Compendium rows asked for; the group shows GROUP_LIMIT and counts the rest. */
const SUGGEST_LIMIT = 12;
/** Compendium rows asked for once the DM shows all of a compendium group. */
const EXPANDED_LIMIT = 100;
const DEBOUNCE_MS = 80;
/** Text search starts at this many characters; one letter would match nearly every note. */
export const MENTION_MIN = 2;

export interface SearchResult {
  /** Unique per row: `type:id` for a name match (the landing's `data-nav`), `mention:type:id`
   *  for a text match, so a note can be listed under Notes and under Mentioned in at once. */
  key: string;
  group: SearchGroup;
  title: string;
  /** The second line: folder path, role, kind and source, "with <member>". */
  detail: string;
  tier: MatchTier;
  icon: IconName;
  target: NavTarget;
  /** A text match's first occurrence in context. */
  snippet?: SearchSnippet;
  /** Breaks ties inside a tier, higher first: how often the phrase occurs. */
  weight?: number;
}

export interface SearchGroupView {
  group: SearchGroup;
  label: string;
  results: SearchResult[];
  /** Matches beyond the rows shown. */
  more: number;
  /** The index stopped at its limit, so there may be more than counted. */
  capped?: boolean;
}

const KIND_LABELS: Record<RecordKind, string> = {
  monster: 'Monster',
  spell: 'Spell',
  item: 'Item',
  feat: 'Feat',
  species: 'Species',
  background: 'Background',
  class: 'Class',
  condition: 'Condition',
};

const SCENE_LABELS: Record<SceneKind, string> = {
  folder: 'Folder',
  title: 'Title card',
  image: 'Image',
  map: 'Map',
  blankGrid: 'Blank grid',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const joinDetail = (parts: readonly (string | false | undefined | null)[]) =>
  parts.filter((p): p is string => !!p).join(' · ');

/** Every name match in the open campaign and the shell, unordered across groups. */
export function searchLocal(
  query: string,
  bundle: CampaignBundle | null,
  webTabs: readonly WebTab[],
): SearchResult[] {
  const out: SearchResult[] = [];
  if (bundle) {
    for (const m of rankByName(query, bundle.notes, (n) => n.title)) {
      const folder = m.item.kind === 'folder';
      const type = folder ? 'folder' : 'note';
      const path = ancestorsOf(bundle.notes, m.item)
        .map((a) => a.title)
        .join(' / ');
      out.push({
        key: navKey(type, m.item.id),
        group: 'notes',
        title: m.item.title,
        detail: joinDetail([folder && 'Folder', path]),
        tier: m.tier,
        icon: folder ? 'folder' : 'card',
        target: { type, id: m.item.id },
      });
    }
    for (const m of rankByName(query, bundle.npcs, (n) => n.name)) {
      out.push({
        key: navKey('npc', m.item.id),
        group: 'npcs',
        title: m.item.name,
        detail: joinDetail([m.item.role, m.item.location, !m.item.isAlive && 'dead']),
        tier: m.tier,
        icon: 'person',
        target: { type: 'npc', id: m.item.id },
      });
    }
    for (const m of rankByName(query, bundle.pcs, (p) => [p.name, p.playerName])) {
      out.push({
        key: navKey('pc', m.item.id),
        group: 'party',
        title: m.item.name,
        detail: joinDetail([m.item.playerName, `${m.item.classText} ${m.item.level}`.trim()]),
        tier: m.tier,
        icon: 'party',
        target: { type: 'pc', id: m.item.id },
      });
    }
    // An encounter answers to its own name first; one that merely contains a matching member
    // (an NPC, a creature, a label) lists after every name match and says who it was.
    const named = rankByName(query, bundle.encounters, (e) => e.name);
    const namedIds = new Set(named.map((m) => m.item.id));
    const withMember = rankByName(
      query,
      bundle.encounters.filter((e) => !namedIds.has(e.id)),
      (e) => e.combatants.map((t) => t.label || t.ref.name),
    );
    for (const m of named) {
      const count = m.item.combatants.reduce((n, t) => n + t.quantity, 0);
      out.push({
        key: navKey('encounter', m.item.id),
        group: 'encounters',
        title: m.item.name,
        detail: `${count} combatant${count === 1 ? '' : 's'}`,
        tier: m.tier,
        icon: 'encounters',
        target: { type: 'encounter', id: m.item.id },
      });
    }
    for (const m of withMember) {
      out.push({
        key: navKey('encounter', m.item.id),
        group: 'encounters',
        title: m.item.name,
        detail: `with ${m.name}`,
        tier: 'substring',
        icon: 'encounters',
        target: { type: 'encounter', id: m.item.id },
      });
    }
    for (const m of rankByName(query, bundle.scenes, (s) => [s.title, s.subtitle])) {
      out.push({
        key: navKey('scene', m.item.id),
        group: 'scenes',
        title: m.item.title,
        detail: joinDetail([SCENE_LABELS[m.item.kind], m.name !== m.item.title && m.name]),
        tier: m.tier,
        icon: 'scenes',
        target: { type: 'scene', id: m.item.id },
      });
    }
  }
  for (const m of rankByName(query, webTabs, (t) => t.title)) {
    out.push({
      key: navKey('webTab', m.item.id),
      group: 'webTabs',
      title: m.item.title,
      detail: hostOf(m.item.url),
      tier: m.tier,
      icon: 'globe',
      target: { type: 'webTab', id: m.item.id },
    });
  }
  return out;
}

/** A compendium hit as a result row. */
export function fromSuggestion(row: CompendiumSuggestion): SearchResult {
  const fact =
    row.kind === 'monster' && row.cr !== null
      ? `CR ${row.cr}`
      : row.kind === 'spell' && row.level !== null
        ? row.level === 0
          ? 'Cantrip'
          : `Level ${row.level}`
        : '';
  return {
    key: navKey('record', row.id),
    group: 'compendium',
    title: row.displayName,
    detail: joinDetail([KIND_LABELS[row.kind], fact, row.sourceName]),
    tier: row.tier,
    icon: 'compendium',
    target: { type: 'record', id: row.id },
  };
}

/** A record whose text holds the phrase; `order` keeps the index's best-first ranking. */
export function fromTextHit(row: CompendiumTextHit, order: number): SearchResult {
  const named = fromSuggestion({ ...row, tier: 'substring' });
  return {
    ...named,
    key: `mention:${named.key}`,
    group: 'compendiumText',
    icon: 'tome',
    snippet: { ...row.snippet, occurrence: 0 },
    weight: -order,
  };
}

const byRank = (a: SearchResult, b: SearchResult) =>
  TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
  (b.weight ?? 0) - (a.weight ?? 0) ||
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/** A note body as the editor shows it; computed once per saved note, not per keystroke. */
const plainBodies = new WeakMap<Note, string>();
function plainBody(note: Note): string {
  let text = plainBodies.get(note);
  if (text === undefined) {
    text = stripMarkdown(note.body);
    plainBodies.set(note, text);
  }
  return text;
}

const mentionDetail = (count: number, where: string) =>
  joinDetail([`${count} mention${count === 1 ? '' : 's'}`, where]);

/**
 * The phrase in the campaign's text (ADR 0017): note bodies, encounter DM notes, and the notes
 * on NPCs, PCs and scenes. Case-insensitive, matched as one phrase; one row per item with its
 * first snippet, opening at that occurrence where the panel can show it (a note's body, an
 * encounter's DM notes). Folders have no text.
 */
export function searchMentions(query: string, bundle: CampaignBundle | null): SearchResult[] {
  const phrase = query.trim();
  if (!bundle || phrase.length < MENTION_MIN) return [];
  const out: SearchResult[] = [];
  const opts = { maxSnippets: 1, context: 40 };
  const push = (
    type: 'note' | 'encounter' | 'npc' | 'pc' | 'scene',
    id: string,
    title: string,
    text: string,
    where: string,
    icon: IconName,
    target: (occurrence: number) => NavTarget,
  ) => {
    if (!text) return;
    const { count, snippets } = phraseSnippets(text, phrase, opts);
    const first = snippets[0];
    if (!count || !first) return;
    out.push({
      key: `mention:${navKey(type, id)}`,
      group: 'mentions',
      title,
      detail: mentionDetail(count, where),
      tier: 'substring',
      icon,
      target: target(first.occurrence),
      snippet: first,
      weight: count,
    });
  };
  for (const n of bundle.notes) {
    if (n.kind === 'folder' || !n.body) continue;
    const path = ancestorsOf(bundle.notes, n)
      .map((a) => a.title)
      .join(' / ');
    push('note', n.id, n.title, plainBody(n), path ? `Note · ${path}` : 'Note', 'card', (o) => ({
      type: 'note',
      id: n.id,
      anchor: { phrase, occurrence: o },
    }));
  }
  for (const e of bundle.encounters) {
    push('encounter', e.id, e.name, e.notes, 'Encounter DM notes', 'encounters', (o) => ({
      type: 'encounter',
      id: e.id,
      anchor: { field: 'notes', phrase, occurrence: o },
    }));
  }
  for (const n of bundle.npcs) {
    push('npc', n.id, n.name, n.notes, 'NPC notes', 'person', () => ({ type: 'npc', id: n.id }));
  }
  for (const p of bundle.pcs) {
    push('pc', p.id, p.name, p.notes, 'PC notes', 'party', () => ({ type: 'pc', id: p.id }));
  }
  for (const s of bundle.scenes) {
    push('scene', s.id, s.title, s.notes, 'Scene notes', 'scenes', () => ({
      type: 'scene',
      id: s.id,
    }));
  }
  return out;
}

/**
 * Results in display order: fixed group order, best tier first inside, capped per group. With
 * `expanded` (Show all), only that group, every row. `capped` names the groups whose answer
 * stopped at the index's limit.
 */
export function groupResults(
  results: readonly SearchResult[],
  limit = GROUP_LIMIT,
  expanded: SearchGroup | null = null,
  capped: ReadonlySet<SearchGroup> = new Set(),
): SearchGroupView[] {
  const groups: SearchGroupView[] = [];
  for (const group of expanded ? [expanded] : GROUP_ORDER) {
    const all = results.filter((r) => r.group === group).sort(byRank);
    if (all.length === 0) continue;
    const max = expanded ? Infinity : limit;
    groups.push({
      group,
      label: GROUP_LABELS[group],
      results: all.slice(0, max),
      more: Math.max(0, all.length - max),
      ...(capped.has(group) ? { capped: true } : {}),
    });
  }
  return groups;
}

/** What the pop-up shows for a store state; the store and the component share it. */
export function viewGroups(
  s: Pick<SearchState, 'local' | 'compendium' | 'compendiumText' | 'expanded' | 'capped'>,
): SearchGroupView[] {
  return groupResults(
    s.local.concat(s.compendium, s.compendiumText),
    GROUP_LIMIT,
    s.expanded,
    s.capped,
  );
}

export const flattenGroups = (groups: readonly SearchGroupView[]): SearchResult[] =>
  groups.flatMap((g) => g.results);

/** Everything answered in memory: name matches, then text mentions. */
function localResults(query: string, bundle: CampaignBundle | null): SearchResult[] {
  return searchLocal(query, bundle, useShellStore.getState().webTabs).concat(
    searchMentions(query, bundle),
  );
}

interface SearchState {
  query: string;
  local: SearchResult[];
  compendium: SearchResult[];
  /** Records whose text holds the phrase (not their name). */
  compendiumText: SearchResult[];
  /** Show all: the one group listed in full, or null for every group. */
  expanded: SearchGroup | null;
  /** Compendium groups whose last answer hit the index's limit. */
  capped: ReadonlySet<SearchGroup>;
  /** A compendium answer is on its way. */
  loading: boolean;
  error: string | null;
  /** The highlighted row; a key no longer shown falls back to the first row. */
  activeKey: string | null;
  /** Bumped by Ctrl+F; the field focuses itself when it changes. */
  summoned: number;

  setQuery(query: string): void;
  /** Lists one group in full (Show all), or every group again with null. */
  setExpanded(group: SearchGroup | null): void;
  groups(): SearchGroupView[];
  active(): SearchResult | null;
  move(delta: 1 | -1): void;
  setActive(key: string | null): void;
  /** Navigates to the active result; false when there is none. */
  activate(): boolean;
  clear(): void;
  summon(): void;
}

let timer: number | null = null;
let seq = 0;

/** How many compendium rows to ask for: more when that group is shown in full. */
const limitFor = (group: SearchGroup, expanded: SearchGroup | null) =>
  expanded === group ? EXPANDED_LIMIT : SUGGEST_LIMIT;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  local: [],
  compendium: [],
  compendiumText: [],
  expanded: null,
  capped: new Set(),
  loading: false,
  error: null,
  activeKey: null,
  summoned: 0,

  setQuery(query) {
    const trimmed = query.trim();
    const bundle = useCampaignStore.getState().current;
    const local = trimmed ? localResults(trimmed, bundle) : [];
    if (timer) window.clearTimeout(timer);
    const mine = ++seq;
    if (!trimmed) {
      set({
        query,
        local,
        compendium: [],
        compendiumText: [],
        capped: new Set(),
        expanded: null,
        loading: false,
        error: null,
      });
      return;
    }
    set({ query, local, loading: true });
    timer = window.setTimeout(() => {
      const preferred = bundle?.campaign.preferredEdition === '2014' ? '2014' : '2024';
      const { expanded } = get();
      const nameLimit = limitFor('compendium', expanded);
      const textLimit = limitFor('compendiumText', expanded);
      const api = window.trifold.compendium;
      Promise.all([
        api.suggest(trimmed, { limit: nameLimit, preferEdition: preferred }),
        trimmed.length >= MENTION_MIN
          ? api.searchText(trimmed, { limit: textLimit, preferEdition: preferred })
          : Promise.resolve([]),
      ])
        .then(([names, texts]) => {
          if (mine !== seq) return;
          const capped = new Set<SearchGroup>();
          if (names.length >= nameLimit) capped.add('compendium');
          if (texts.length >= textLimit) capped.add('compendiumText');
          set({
            compendium: names.map(fromSuggestion),
            compendiumText: texts.map(fromTextHit),
            capped,
            loading: false,
            error: null,
          });
        })
        .catch((err: unknown) => {
          if (mine !== seq) return;
          set({ compendium: [], compendiumText: [], loading: false, error: errorMessage(err) });
        });
    }, DEBOUNCE_MS);
  },

  setExpanded(group) {
    if (get().expanded === group) return;
    set({ expanded: group, activeKey: null });
    // A compendium group shown in full asks the index again for more rows.
    if (group === 'compendium' || group === 'compendiumText') get().setQuery(get().query);
  },

  groups() {
    return viewGroups(get());
  },

  active() {
    const flat = flattenGroups(get().groups());
    return flat.find((r) => r.key === get().activeKey) ?? flat[0] ?? null;
  },

  move(delta) {
    const flat = flattenGroups(get().groups());
    if (flat.length === 0) return;
    const current = get().active();
    const at = current ? flat.findIndex((r) => r.key === current.key) : -1;
    const next =
      at < 0 ? (delta > 0 ? 0 : flat.length - 1) : (at + delta + flat.length) % flat.length;
    set({ activeKey: flat[next]!.key });
  },

  setActive(key) {
    if (get().activeKey !== key) set({ activeKey: key });
  },

  activate() {
    const result = get().active();
    if (!result) return false;
    navigate(result.target);
    return true;
  },

  clear() {
    if (timer) window.clearTimeout(timer);
    seq += 1;
    set({
      query: '',
      local: [],
      compendium: [],
      compendiumText: [],
      expanded: null,
      capped: new Set(),
      loading: false,
      error: null,
      activeKey: null,
    });
  },

  summon() {
    set({ summoned: get().summoned + 1 });
  },
}));

// A rename or a new note while the list is open shows at once; another campaign starts clean.
useCampaignStore.subscribe((s, prev) => {
  if (s.current === prev.current) return;
  const { query } = useSearchStore.getState();
  if (!s.current || s.current.campaign.id !== prev.current?.campaign.id) {
    if (query) useSearchStore.getState().clear();
    return;
  }
  const trimmed = query.trim();
  if (trimmed) {
    useSearchStore.setState({
      local: localResults(trimmed, s.current),
    });
  }
});
