import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { initialPresenterState, type TrifoldBridge } from '@trifold/api';
import { defaultLibrarySettings } from '@trifold/schema';

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
