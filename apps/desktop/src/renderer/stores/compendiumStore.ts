import { create } from 'zustand';
import { identityOf, type Original } from '../features/compendium/creatureSave';
import { blankRecord, isOwnRecord } from '../features/compendium/homebrew';
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
   * One Edit on every record (ADR 0035): the DM's own record opens as it is (`editingOwn`); any
   * other opens as a copy not yet written, as does a blank one from New homebrew. The editor's
   * Save step decides where it lives and where it is used; nothing is written before Confirm.
   */
  editing: CompendiumRecord | null;
  /** `editing` is one of the DM's own records, edited in place unless saved as new. */
  editingOwn: boolean;
  /** What a copy was made from, for "Every Goblin in the campaign"; null for a blank one. */
  editingFrom: Original | null;
  /** Opens the editor on a blank record of `kind`, showing that kind's list. */
  newHomebrew(kind: RecordKind): Promise<void>;
  /** Opens the editor on a copy of any record, not yet written, showing its kind. */
  editCopy(recordId: string): Promise<void>;
  /** Edit on the selected record: in place when it is the DM's own, else as a copy. */
  startEdit(): Promise<void>;
  cancelEdit(): void;
  /** After the editor's Confirm: back to the list with the saved record selected. */
  finishEdit(saved: CompendiumRecord): Promise<void>;
  removeHomebrew(recordId: string): Promise<void>;
  /** Add to my compendium (ADR 0035): the selected campaign creature into the Library's homebrew. */
  addToLibrary(): Promise<void>;
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
  editingOwn: false,
  editingFrom: null,
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

  async editCopy(recordId) {
    try {
      const original = await window.trifold.compendium.get(recordId);
      const copy = await window.trifold.homebrew.draft(recordId);
      if (get().kind !== copy.kind) await get().setKind(copy.kind);
      set({
        editing: copy,
        editingOwn: false,
        editingFrom: original
          ? { identity: identityOf(original), name: original.displayName }
          : null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async newHomebrew(kind) {
    if (get().kind !== kind) await get().setKind(kind);
    set({ editing: blankRecord(kind), editingOwn: false, editingFrom: null });
  },

  async startEdit() {
    const selected = get().selected;
    if (!selected) return;
    if (isOwnRecord(selected)) {
      set({
        editing: selected,
        editingOwn: true,
        editingFrom: { identity: identityOf(selected), name: selected.displayName },
      });
    } else {
      await get().editCopy(selected.id);
    }
  },

  cancelEdit() {
    set({ editing: null, editingOwn: false, editingFrom: null });
  },

  async finishEdit(saved) {
    set({ editing: null, editingOwn: false, editingFrom: null });
    await get().search();
    await get().select(saved.id);
  },

  async addToLibrary() {
    const selected = get().selected;
    if (!selected) return;
    try {
      const added = await window.trifold.homebrew.addToLibrary(selected.id);
      await get().search();
      await get().select(added.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
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
