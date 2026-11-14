import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { discardPendingSaves } from '../stores/pendingSaves';
import {
  initialPresenterState,
  type PhoneAudioStatus,
  type TrifoldBridge,
  type UpdateStatus,
} from '@trifold/api';
import { defaultLibrarySettings, type CompendiumRecord, type Playlist } from '@trifold/schema';

/**
 * Vitest setup for the renderer. `installBridgeMock` builds a complete `window.trifold` of
 * `vi.fn` stubs with harmless defaults (empty lists, settings as shipped, "not mocked" throws for
 * writes a test must set up itself), so components and stores run under jsdom without Electron.
 * The hooks below install it fresh before each test, clean up after, and polyfill the layout
 * APIs jsdom lacks.
 */

function phoneStatus(state: PhoneAudioStatus['state']): PhoneAudioStatus {
  return { supported: true, state, device: null, detail: null, remembered: [], source: 'computer' };
}

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
      openSystemPage: vi.fn(async () => true),
      openExternal: vi.fn(async () => true),
      savesFlushed: vi.fn(async () => undefined),
    },
    updates: (() => {
      // Off and already answered, so no test sees the Library's question unless it asks to.
      const status: UpdateStatus = {
        current: '0.3.0',
        enabled: false,
        asked: true,
        checking: false,
        lastCheckAt: null,
        available: null,
        dismissed: false,
        lastError: null,
      };
      return {
        status: vi.fn(async () => status),
        setEnabled: vi.fn(async (enabled: boolean) => ({ ...status, enabled })),
        checkNow: vi.fn(async () => status),
        dismiss: vi.fn(async () => status),
        openDownload: vi.fn(async () => false),
      };
    })(),
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
      chooseFile: vi.fn(async () => null),
      restoreFile: vi.fn(async () => ({
        path: '',
        ok: true,
        error: null,
        settings: defaultLibrarySettings(),
        index: { ok: true, version: 0, error: null },
      })),
      copyStatus: vi.fn(async () => ({
        folder: null,
        target: null,
        lastCopyAt: null,
        lastError: null,
      })),
      chooseCopyFolder: vi.fn(async () => ({
        folder: null,
        target: null,
        lastCopyAt: null,
        lastError: null,
      })),
      stopCopying: vi.fn(async () => ({
        folder: null,
        target: null,
        lastCopyAt: null,
        lastError: null,
      })),
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
    phoneAudio: {
      status: vi.fn(async () => phoneStatus('off')),
      listDevices: vi.fn(async () => []),
      connect: vi.fn(async (device) => ({ ...phoneStatus('connecting'), device })),
      disconnect: vi.fn(async () => phoneStatus('off')),
      forget: vi.fn(async () => phoneStatus('off')),
      setSource: vi.fn(async (source) => ({ ...phoneStatus('off'), source })),
    },
    homebrew: {
      duplicate: vi.fn(async () => {
        throw new Error('not in tests');
      }),
      draft: vi.fn(async () => {
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
      setEdition2024Books: vi.fn(async () => ({
        sourceId: 'src',
        name: 'src',
        status: 'updated' as const,
        counts: {},
        warnings: [],
        durationMs: 0,
      })),
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
      remove: vi.fn(async () => undefined),
      bundles: vi.fn(async () => []),
      chooseXmlFile: vi.fn(async () => null),
      importXml: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      exportPreview: vi.fn(async () => ({ pcs: 0, homebrew: 0, importedRecords: 0 })),
      exportTo: vi.fn(async () => null),
      choosePackage: vi.fn(async () => null),
      importPackage: vi.fn(async () => {
        throw new Error('not mocked');
      }),
      sample: vi.fn(async () => ({ available: false, present: false, name: null })),
      addSample: vi.fn(async () => {
        throw new Error('not mocked');
      }),
    },
    notes: {
      save: vi.fn(async (n) => n),
      remove: vi.fn(async () => undefined),
      move: vi.fn(async () => []),
      capture: vi.fn(async () => {
        throw new Error('not mocked');
      }),
    },
    noteTemplates: {
      list: vi.fn(async () => []),
      save: vi.fn(async (t) => t),
      remove: vi.fn(async () => undefined),
    },
    npcs: {
      save: vi.fn(async (n) => n),
      remove: vi.fn(async () => undefined),
      copyFrom: vi.fn(async () => {
        throw new Error('not mocked');
      }),
    },
    scenes: {
      save: vi.fn(async (scene) => scene),
      remove: vi.fn(async () => undefined),
      importImage: vi.fn(async () => null),
    },
    counters: {
      save: vi.fn(async (counter) => ({ ...counter, id: counter.id || 'counter-new' })),
      remove: vi.fn(async () => undefined),
      move: vi.fn(async () => []),
    },
    timers: {
      save: vi.fn(async (timer) => ({ ...timer, id: timer.id || 'timer-new' })),
      remove: vi.fn(async () => undefined),
      move: vi.fn(async () => []),
    },
    pinnedRolls: {
      save: vi.fn(async (pin) => ({ ...pin, id: pin.id || `pin-${pin.createdAt}` })),
      remove: vi.fn(async () => undefined),
    },
    pcs: {
      save: vi.fn(async (pc) => pc),
      remove: vi.fn(async () => undefined),
      copyFrom: vi.fn(async () => {
        throw new Error('not mocked');
      }),
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
      suggest: vi.fn(async () => []),
      searchText: vi.fn(async () => []),
    },
    on: vi.fn(() => () => undefined),
  };
  Object.assign(window, { trifold: bridge });
  return bridge;
}

// waitFor/findBy give up after 1 s by default; slower CI runners (macOS especially) can take
// just over that to type into the note editor.
configure({ asyncUtilTimeout: 3000 });

beforeEach(() => {
  installBridgeMock();
});

afterEach(() => {
  cleanup();
  discardPendingSaves();
});

// ProseMirror (the note editor) measures ranges and elements; jsdom has no layout, so give it
// empty boxes and a no-op scroll instead of crashes.
const emptyRect = (): DOMRect =>
  ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  }) as DOMRect;
if (typeof Range !== 'undefined') {
  Range.prototype.getBoundingClientRect ??= emptyRect;
  Range.prototype.getClientRects ??= () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
}
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= () => undefined;
}
if (typeof document !== 'undefined') {
  document.elementFromPoint ??= () => null;
}
