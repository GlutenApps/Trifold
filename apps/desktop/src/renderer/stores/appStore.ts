import { create } from 'zustand';
import type { AppInfo, DisplayInfo, LibraryInfo } from '@trifold/api';
import { errorMessage, type LibrarySettings } from '@trifold/schema';

/**
 * App-level state the console needs before any campaign is open: build info, the open Library
 * and its settings, the displays, and whether the player window is up. Nothing here persists on
 * its own: Library settings are written by main through `library.updateSettings` and the store
 * keeps the copy main returns (DESIGN.md §4.2). Any feature may call its actions; the player
 * window never does. The theme is applied here because it is a Library setting.
 */
interface AppState {
  info: AppInfo | null;
  library: LibraryInfo | null;
  displays: DisplayInfo[];
  playerOpen: boolean;
  /** Last failure from the main process, shown as a banner until dismissed. */
  error: string | null;

  load(): Promise<void>;
  chooseLibrary(): Promise<void>;
  openLibraryFolder(): Promise<void>;
  updateSettings(patch: Partial<LibrarySettings>): Promise<void>;
  refreshDisplays(): Promise<void>;
  openPlayer(displayId?: number | null): Promise<void>;
  closePlayer(): Promise<void>;
  setPlayerOpen(open: boolean): void;
  clearError(): void;
}

function applyTheme(theme: LibrarySettings['theme'] | undefined): void {
  document.documentElement.dataset['theme'] = theme ?? 'dark';
}

export const useAppStore = create<AppState>((set, get) => ({
  info: null,
  library: null,
  displays: [],
  playerOpen: false,
  error: null,

  async load() {
    try {
      const [info, library, displays, playerOpen] = await Promise.all([
        window.trifold.app.getInfo(),
        window.trifold.library.getInfo(),
        window.trifold.displays.list(),
        window.trifold.player.isOpen(),
      ]);
      set({ info, library, displays, playerOpen, error: null });
      applyTheme(library.settings?.theme);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async chooseLibrary() {
    try {
      const path = await window.trifold.library.chooseFolder();
      if (!path) return;
      const library = await window.trifold.library.open(path);
      set({ library, error: library.ok ? null : library.error });
      applyTheme(library.settings?.theme);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async openLibraryFolder() {
    try {
      await window.trifold.library.openInExplorer();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async updateSettings(patch) {
    try {
      const settings = await window.trifold.library.updateSettings(patch);
      const library = get().library;
      set({ library: library ? { ...library, settings } : library });
      applyTheme(settings.theme);
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async refreshDisplays() {
    try {
      set({ displays: await window.trifold.displays.list() });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async openPlayer(displayId) {
    try {
      await window.trifold.player.open(
        displayId ?? get().library?.settings?.playerDisplayId ?? null,
      );
      set({ playerOpen: true });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async closePlayer() {
    try {
      await window.trifold.player.close();
      set({ playerOpen: false });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setPlayerOpen(open) {
    set({ playerOpen: open });
  },

  clearError() {
    set({ error: null });
  },
}));
