import { create } from 'zustand';
import type { ImportProgress, ImportReport } from '@trifold/api';
import type { Source } from '@trifold/schema';

interface SourcesState {
  sources: Source[];
  loading: boolean;
  importing: boolean;
  progress: ImportProgress | null;
  lastReport: ImportReport | null;
  error: string | null;

  load(): Promise<void>;
  importFromDialog(): Promise<void>;
  importPath(path: string): Promise<ImportReport | null>;
  setEnabled(sourceId: string, enabled: boolean): Promise<void>;
  remove(sourceId: string): Promise<void>;
  rebuildIndex(): Promise<void>;
  setProgress(progress: ImportProgress | null): void;
  clearError(): void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
      set({ error: messageOf(err), loading: false });
    }
  },

  async importFromDialog() {
    try {
      const path = await window.trifold.sources.chooseFile();
      if (!path) return;
      await get().importPath(path);
    } catch (err) {
      set({ error: messageOf(err) });
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
      set({ error: messageOf(err), importing: false, progress: null });
      return null;
    }
  },

  async setEnabled(sourceId, enabled) {
    try {
      const updated = await window.trifold.sources.setEnabled(sourceId, enabled);
      set({ sources: get().sources.map((s) => (s.id === sourceId ? updated : s)) });
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  async remove(sourceId) {
    try {
      await window.trifold.sources.remove(sourceId);
      set({ sources: get().sources.filter((s) => s.id !== sourceId) });
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  async rebuildIndex() {
    try {
      await window.trifold.sources.rebuildIndex();
      await get().load();
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  setProgress(progress) {
    set({ progress });
  },

  clearError() {
    set({ error: null });
  },
}));
