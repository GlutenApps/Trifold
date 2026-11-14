import { create } from 'zustand';
import type { ImportProgress, ImportReport, SourceSummary } from '@trifold/api';
import { errorMessage } from '@trifold/schema';

/**
 * Compendium sources as the Library page lists them (DESIGN.md §6.1): the imported files, their
 * enabled flags, and the progress and report of the import running now. Main owns the source
 * files and the index; this store keeps main's answers and the progress events the page feeds
 * it through `setProgress`. Nothing persists from here and the list is reloaded after every
 * import, re-import or rebuild.
 */
interface SourcesState {
  sources: SourceSummary[];
  loading: boolean;
  importing: boolean;
  progress: ImportProgress | null;
  lastReport: ImportReport | null;
  error: string | null;

  load(): Promise<void>;
  importFromDialog(): Promise<void>;
  importPath(path: string): Promise<ImportReport | null>;
  reimport(sourceId: string): Promise<void>;
  /** Marks which of an imported file's books use 2024 rules and re-tags it (ADR 0028). */
  setEdition2024Books(sourceId: string, books: string[]): Promise<boolean>;
  setEnabled(sourceId: string, enabled: boolean): Promise<void>;
  /** The campaigns an imported source shows in (ADR 0036); null for every campaign. */
  setCampaigns(sourceId: string, campaignIds: string[] | null): Promise<boolean>;
  remove(sourceId: string): Promise<void>;
  setProgress(progress: ImportProgress | null): void;
  clearError(): void;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  loading: false,
  importing: false,
  progress: null,
  lastReport: null,
  error: null,

  async load() {
    set({ loading: true });
    try {
      set({ sources: await window.trifold.sources.list(), loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  async importFromDialog() {
    try {
      const path = await window.trifold.sources.chooseFile();
      if (!path) return;
      await get().importPath(path);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async importPath(path) {
    set({ importing: true, progress: null, lastReport: null, error: null });
    try {
      const report = await window.trifold.sources.importFile(path);
      set({ lastReport: report, importing: false, progress: null });
      await get().load();
      return report;
    } catch (err) {
      set({ error: errorMessage(err), importing: false, progress: null });
      return null;
    }
  },

  async reimport(sourceId) {
    set({ importing: true, progress: null, lastReport: null, error: null });
    try {
      const report = await window.trifold.sources.reimport(sourceId);
      set({ lastReport: report, importing: false, progress: null });
      await get().load();
    } catch (err) {
      set({ error: errorMessage(err), importing: false, progress: null });
    }
  },

  async setEdition2024Books(sourceId, books) {
    set({ importing: true, progress: null, lastReport: null, error: null });
    try {
      const report = await window.trifold.sources.setEdition2024Books(sourceId, books);
      set({ lastReport: report, importing: false, progress: null });
      await get().load();
      return true;
    } catch (err) {
      set({ error: errorMessage(err), importing: false, progress: null });
      return false;
    }
  },

  async setEnabled(sourceId, enabled) {
    try {
      const updated = await window.trifold.sources.setEnabled(sourceId, enabled);
      set({
        sources: get().sources.map((s) => (s.id === sourceId ? { ...s, ...updated } : s)),
      });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async setCampaigns(sourceId, campaignIds) {
    try {
      const updated = await window.trifold.sources.setCampaigns(sourceId, campaignIds);
      set({
        sources: get().sources.map((s) => (s.id === sourceId ? { ...s, ...updated } : s)),
      });
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  async remove(sourceId) {
    try {
      await window.trifold.sources.remove(sourceId);
      set({ sources: get().sources.filter((s) => s.id !== sourceId) });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setProgress(progress) {
    set({ progress });
  },

  clearError() {
    set({ error: null });
  },
}));
