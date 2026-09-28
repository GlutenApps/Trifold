import { create } from 'zustand';
import type { CompendiumFacets, CompendiumQuery, CompendiumRow } from '@trifold/api';
import type { CompendiumRecord, RecordKind } from '@trifold/schema';

export type Filters = Omit<CompendiumQuery, 'kind' | 'limit' | 'offset'>;

interface CompendiumState {
  kind: RecordKind;
  filters: Filters;
  rows: CompendiumRow[];
  total: number;
  tookMs: number;
  facets: CompendiumFacets;
  loading: boolean;
  /** The record shown in the detail pane plus every edition sharing its key. */
  selected: CompendiumRecord | null;
  editions: CompendiumRecord[];
  /** Records opened from links inside the current one, for the Back button. */
  history: CompendiumRecord[];
  error: string | null;

  setKind(kind: RecordKind): Promise<void>;
  setFilters(patch: Partial<Filters>): void;
  search(): Promise<void>;
  loadFacets(): Promise<void>;
  select(recordId: string): Promise<void>;
  openByKey(kind: RecordKind, key: string): Promise<boolean>;
  switchEdition(record: CompendiumRecord): void;
  back(): void;
  clearError(): void;
}

const EMPTY_FACETS: CompendiumFacets = { types: [], sizes: [], environments: [] };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let searchSeq = 0;

export const useCompendiumStore = create<CompendiumState>((set, get) => ({
  kind: 'monster',
  filters: { edition: 'all', npc: 'any' },
  rows: [],
  total: 0,
  tookMs: 0,
  facets: EMPTY_FACETS,
  loading: false,
  selected: null,
  editions: [],
  history: [],
  error: null,

  async setKind(kind) {
    set({
      kind,
      filters: { edition: get().filters.edition, npc: 'any' },
      selected: null,
      editions: [],
      history: [],
    });
    await Promise.all([get().search(), get().loadFacets()]);
  },

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } });
  },

  async search() {
    const seq = (searchSeq += 1);
    set({ loading: true });
    try {
      const result = await window.trifold.compendium.search({ kind: get().kind, ...get().filters });
      if (seq !== searchSeq) return;
      set({
        rows: result.rows,
        total: result.total,
        tookMs: result.tookMs,
        loading: false,
        error: null,
      });
    } catch (err) {
      if (seq !== searchSeq) return;
      set({ error: messageOf(err), loading: false });
    }
  },

  async loadFacets() {
    try {
      set({ facets: await window.trifold.compendium.facets(get().kind) });
    } catch {
      set({ facets: EMPTY_FACETS });
    }
  },

  async select(recordId) {
    try {
      const record = await window.trifold.compendium.get(recordId);
      if (!record) {
        set({ error: 'That record is no longer in an enabled source.' });
        return;
      }
      const editions = await window.trifold.compendium.findByKey(record.kind, record.key);
      set({ selected: record, editions, history: [] });
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  async openByKey(kind, key) {
    try {
      const matches = await window.trifold.compendium.findByKey(kind, key);
      const next = matches.find((m) => m.edition === get().selected?.edition) ?? matches[0];
      if (!next) return false;
      const current = get().selected;
      set({
        selected: next,
        editions: matches,
        history: current ? [...get().history, current] : get().history,
      });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  switchEdition(record) {
    set({ selected: record });
  },

  back() {
    const history = get().history;
    const previous = history[history.length - 1];
    if (!previous) return;
    set({ selected: previous, history: history.slice(0, -1) });
    void window.trifold.compendium
      .findByKey(previous.kind, previous.key)
      .then((editions) => set({ editions }))
      .catch(() => undefined);
  },

  clearError() {
    set({ error: null });
  },
}));
