import { app, dialog, shell } from 'electron';
import { EVENT_CHANNELS, type TrifoldApi } from '@trifold/api';
import type { AppConfigStore } from './appConfig';
import { syncIndex } from './index/sync';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';
import type { PresenterHub } from './presenter';
import { importXmlSource } from './sources/importXml';
import { WindowManager } from './windows';

export interface ApiContext {
  config: AppConfigStore;
  session: LibrarySession;
  windows: WindowManager;
  presenter: PresenterHub;
  logger: Logger;
}

const RECENT_LIBRARIES = 10;

/** The main-process implementation of `TrifoldApi`. Registered by `registerIpc`. */
export function createApi(ctx: ApiContext): TrifoldApi {
  const requireStore = () => {
    const store = ctx.session.store;
    if (!store) throw new Error('No Library is open');
    return store;
  };
  let importing = false;

  return {
    app: {
      async getInfo() {
        return {
          version: app.getVersion(),
          electron: process.versions.electron ?? '',
          chrome: process.versions.chrome ?? '',
          node: process.versions.node,
          platform: process.platform,
          userDataPath: app.getPath('userData'),
        };
      },
    },

    library: {
      async getInfo() {
        return ctx.session.info();
      },
      async chooseFolder() {
        const result = await dialog.showOpenDialog({
          title: 'Choose a Library folder',
          properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      async open(path) {
        const info = await ctx.session.open(path);
        if (info.ok) {
          const recent = [
            info.path,
            ...ctx.config.get().recentLibraries.filter((p) => p !== info.path),
          ].slice(0, RECENT_LIBRARIES);
          await ctx.config.update({ libraryPath: info.path, recentLibraries: recent });
        }
        return info;
      },
      async openInExplorer() {
        const error = await shell.openPath(requireStore().root);
        if (error) throw new Error(error);
      },
      async getSettings() {
        return requireStore().getSettings();
      },
      async updateSettings(patch) {
        return requireStore().updateSettings(patch);
      },
    },

    displays: {
      async list() {
        return WindowManager.listDisplays();
      },
    },

    player: {
      async open(displayId) {
        const preferred = displayId ?? ctx.session.store?.getSettings().playerDisplayId ?? null;
        ctx.windows.openPlayer(WindowManager.pickDisplay(preferred));
      },
      async close() {
        ctx.windows.closePlayer();
      },
      async isOpen() {
        return ctx.windows.isPlayerOpen();
      },
    },

    presenter: {
      async push(state) {
        ctx.presenter.push(state);
      },
      async get() {
        return ctx.presenter.get();
      },
    },

    sources: {
      async list() {
        const sources = ctx.session.sources;
        return sources ? sources.list() : [];
      },
      async chooseFile() {
        const result = await dialog.showOpenDialog({
          title: 'Import a compendium XML file',
          properties: ['openFile'],
          filters: [
            { name: 'Compendium XML', extensions: ['xml'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      async importFile(path) {
        if (importing) throw new Error('An import is already running');
        const { store, sources, index } = ctx.session.require();
        importing = true;
        try {
          return await importXmlSource(
            {
              store,
              sources,
              index,
              logger: ctx.logger,
              onProgress: (p) => ctx.windows.sendToConsole(EVENT_CHANNELS.importProgress, p),
            },
            path,
          );
        } finally {
          importing = false;
        }
      },
      async setEnabled(sourceId, enabled) {
        const { sources, index } = ctx.session.require();
        const source = await sources.get(sourceId);
        if (!source) throw new Error(`Source ${sourceId} not found`);
        const next = { ...source, enabled };
        await sources.write(next);
        index.setSourceEnabled(sourceId, enabled);
        return next;
      },
      async remove(sourceId) {
        const { sources, index } = ctx.session.require();
        await sources.remove(sourceId);
        index.removeSource(sourceId);
        ctx.logger.info(`source ${sourceId} removed`);
      },
      async rebuildIndex() {
        const { store, sources, index } = ctx.session.require();
        return syncIndex(index, sources, store, ctx.logger, true);
      },
    },

    compendium: {
      async search(query) {
        return ctx.session.require().index.search(query);
      },
      async get(recordId) {
        return ctx.session.require().index.get(recordId);
      },
      async findByKey(kind, key) {
        return ctx.session.require().index.findByKey(kind, key);
      },
      async facets(kind) {
        return ctx.session.require().index.facets(kind);
      },
    },
  };
}
