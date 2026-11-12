import { create } from 'zustand';
import { blankRecord } from '../features/compendium/homebrew';
import type { CompendiumFacets, CompendiumQuery, CompendiumRow } from '@trifold/api';
import { errorMessage, type CompendiumRecord, type RecordKind } from '@trifold/schema';
import { useCampaignStore } from './campaignStore';

/**
 * The Compendium tab's browsing state (DESIGN.md §6.1): kind, filters, the current result page,
 * facets, the selected record with its other editions, and a back history for links followed
 * inside a record. All of it is in memory and session only; searches go to main's SQLite index
 * and homebrew edits go to main, which owns the files. A stale search answer is dropped by
 * sequence number so a slow query never overwrites a newer one.
 */
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
  /**
   * Shows a record from anywhere (a deep link, ADR 0017): switches to its kind when the tab is
   * on another, then selects it. Resolves false when it is gone from the enabled sources.
   */
  openRecord(recordId: string): Promise<boolean>;
  openByKey(kind: RecordKind, key: string): Promise<boolean>;
  switchEdition(record: CompendiumRecord): void;
  back(): void;
  clearError(): void;
  /**
   * Homebrew (DESIGN.md §6.2, ADR 0026): start one blank or as a copy of any record, edit,
   * save, delete. `editingNew` marks a blank one that is not on disk until it is saved.
   */
  editing: CompendiumRecord | null;
  editingNew: boolean;
  saving: boolean;
  duplicateSelected(): Promise<void>;
  /** Copies any record into homebrew, shows its kind, and opens the copy in the editor. */
  duplicateRecord(recordId: string): Promise<void>;
  /** Opens the editor on a blank record of `kind`, showing that kind's list. */
  newHomebrew(kind: RecordKind): Promise<void>;
  startEdit(): void;
  cancelEdit(): void;
  saveHomebrew(record: CompendiumRecord): Promise<boolean>;
  removeHomebrew(recordId: string): Promise<void>;
}

const EMPTY_FACETS: CompendiumFacets = { types: [], sizes: [], environments: [] };

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
  editing: null,
  editingNew: false,
  saving: false,
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
      // Rows sharing a key collapse to one; the campaign's preferred edition heads it (DESIGN.md §7.2).
      const preferred = useCampaignStore.getState().current?.campaign.preferredEdition;
      const result = await window.trifold.compendium.search({
        kind: get().kind,
        ...get().filters,
        preferEdition: preferred === '2014' ? '2014' : '2024',
      });
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
      set({ error: errorMessage(err), loading: false });
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
      set({ error: errorMessage(err) });
    }
  },

  async openRecord(recordId) {
    try {
      const record = await window.trifold.compendium.get(recordId);
      if (!record) {
        set({ error: 'That record is no longer in an enabled source.' });
        return false;
      }
      const editions = await window.trifold.compendium.findByKey(record.kind, record.key);
      if (record.kind !== get().kind) {
        set({
          kind: record.kind,
          filters: { edition: get().filters.edition, npc: 'any' },
          selected: record,
          editions,
          history: [],
        });
        void Promise.all([get().search(), get().loadFacets()]);
      } else {
        set({ selected: record, editions, history: [] });
      }
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
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
      set({ error: errorMessage(err) });
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

  async duplicateSelected() {
    const selected = get().selected;
    if (selected) await get().duplicateRecord(selected.id);
  },

  async duplicateRecord(recordId) {
    try {
      const copy = await window.trifold.homebrew.duplicate(recordId);
      if (get().kind !== copy.kind) await get().setKind(copy.kind);
      else await get().search();
      await get().select(copy.id);
      set({ editing: copy, editingNew: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async newHomebrew(kind) {
    if (get().kind !== kind) await get().setKind(kind);
    set({ editing: blankRecord(kind), editingNew: true });
  },

  startEdit() {
    const selected = get().selected;
    if (selected?.sourceId === 'homebrew') set({ editing: selected, editingNew: false });
  },

  cancelEdit() {
    set({ editing: null, editingNew: false });
  },

  async saveHomebrew(record) {
    set({ saving: true });
    try {
      const saved = await window.trifold.homebrew.save(record);
      set({ editing: null, editingNew: false, saving: false });
      await get().search();
      await get().select(saved.id);
      return true;
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async removeHomebrew(recordId) {
    try {
      await window.trifold.homebrew.remove(recordId);
      set({ selected: null, editing: null, editions: [] });
      await get().search();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
