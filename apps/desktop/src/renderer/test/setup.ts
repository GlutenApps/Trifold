import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { initialPresenterState, type TrifoldBridge } from '@trifold/api';
import { defaultLibrarySettings, type CompendiumRecord, type Playlist } from '@trifold/schema';

/** A fully mocked `window.trifold` so renderer tests never touch Electron. */
export function installBridgeMock(): TrifoldBridge {
  const settings = defaultLibrarySettings();
  const bridge: TrifoldBridge = {
    app: {
      getInfo: vi.fn(async () => ({
        version: '0.0.0-test',
        electron: '0',
        chrome: '0',
        node: '0',
        platform: 'win32',
        userDataPath: 'C:\\test',
      })),
      saveTextFile: vi.fn(async () => null),
    },
    library: {
      getInfo: vi.fn(async () => ({
        path: 'C:\\test\\Library',
        ok: true,
        error: null,
        settings,
        index: { ok: true, version: 1, error: null },
      })),
      chooseFolder: vi.fn(async () => null),
      open: vi.fn(async (path: string) => ({
        path,
        ok: true,
        error: null,
        settings,
        index: { ok: true, version: 1, error: null },
      })),
      openInExplorer: vi.fn(async () => undefined),
      getSettings: vi.fn(async () => settings),
      updateSettings: vi.fn(async (patch) => ({ ...settings, ...patch })),
    },
    displays: {
      list: vi.fn(async () => []),
    },
    player: {
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      isOpen: vi.fn(async () => false),
    },
    presenter: {
      push: vi.fn(async () => undefined),
      get: vi.fn(async () => initialPresenterState),
    },
    backups: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => null),
      restore: vi.fn(async () => ({
        path: '',
        ok: true,
        error: null,
        settings: defaultLibrarySettings(),
        index: { ok: true, version: 0, error: null },
      })),
      openFolder: vi.fn(async () => undefined),
    },
    music: {
      library: vi.fn(async () => ({ folders: [], tracks: [], lastScanAt: null })),
      chooseFolder: vi.fn(async () => null),
      addFolder: vi.fn(async () => ({ folders: [], tracks: [], lastScanAt: null })),
      removeFolder: vi.fn(async () => ({ folders: [], tracks: [], lastScanAt: null })),
      rescan: vi.fn(async () => ({ folders: [], tracks: [], lastScanAt: null })),
      updateTrack: vi.fn(async () => null),
      listPlaylists: vi.fn(async () => []),
      savePlaylist: vi.fn(async (p: Playlist) => p),
      removePlaylist: vi.fn(async () => undefined),
    },
    homebrew: {
      duplicate: vi.fn(async () => {
        throw new Error('not in tests');
      }),
      save: vi.fn(async (r: CompendiumRecord) => r),
      remove: vi.fn(async () => undefined),
    },
    icons: {
      tables: vi.fn(async () => ({
        creatureType: {},
        ancestry: {},
        nameKeywords: {},
        synonyms: {},
        itemType: {},
        spellSchool: {},
      })),
      available: vi.fn(async () => []),
      credits: vi.fn(async () => null),
      reportMiss: vi.fn(async () => undefined),
    },
    sources: {
      list: vi.fn(async () => []),
      chooseFile: vi.fn(async () => null),
      reimport: vi.fn(async () => ({
        sourceId: 'src',
        name: 'src',
        status: 'updated' as const,
        counts: {},
        warnings: [],
        durationMs: 0,
      })),
      importFile: vi.fn(async (path: string) => ({
        sourceId: 'src',
        name: path,
        status: 'imported' as const,
        counts: {},
        warnings: [],
        durationMs: 0,
      })),
      setEnabled: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      remove: vi.fn(async () => undefined),
      rebuildIndex: vi.fn(async () => ({ records: 0, sources: 0, version: 1, tookMs: 0 })),
      attribution: vi.fn(async () => []),
    },
    campaigns: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      open: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      current: vi.fn(async () => null),
      close: vi.fn(async () => undefined),
      update: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      chooseXmlFile: vi.fn(async () => null),
      importXml: vi.fn(async () => {
        throw new Error('not mocked');
      }),
    },
    adventures: {
      save: vi.fn(async (a) => a),
      remove: vi.fn(async () => undefined),
    },
    notes: {
      save: vi.fn(async (n) => n),
      remove: vi.fn(async () => undefined),
    },
    npcs: {
      save: vi.fn(async (n) => n),
      remove: vi.fn(async () => undefined),
    },
    scenes: {
      save: vi.fn(async (scene) => scene),
      remove: vi.fn(async () => undefined),
      importImage: vi.fn(async () => null),
    },
    pcs: {
      save: vi.fn(async (pc) => pc),
      remove: vi.fn(async () => undefined),
      quickAdd: vi.fn(async () => []),
    },
    encounters: {
      save: vi.fn(async (e) => e),
      remove: vi.fn(async () => undefined),
      saveState: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      finish: vi.fn(async () => {
        throw new Error('not mocked');
      }),
    },
    compendium: {
      search: vi.fn(async () => ({ rows: [], total: 0, tookMs: 0 })),
      get: vi.fn(async () => null),
      findByKey: vi.fn(async () => []),
      facets: vi.fn(async () => ({ types: [], sizes: [], environments: [] })),
    },
    on: vi.fn(() => () => undefined),
  };
  Object.assign(window, { trifold: bridge });
  return bridge;
}

beforeEach(() => {
  installBridgeMock();
});

afterEach(() => {
  cleanup();
});
