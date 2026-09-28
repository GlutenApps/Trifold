import { app, dialog, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reopenLibrary } from './libraryOpen';
import { EVENT_CHANNELS, type TrifoldApi } from '@trifold/api';
import type { AppConfigStore } from './appConfig';
import { createCampaignApi } from './campaignApi';
import { createMusicApi } from './musicApi';
import type { IconResources } from './icons';
import { syncIndex } from './index/sync';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';
import type { PresenterHub } from './presenter';
import { importXmlSource, isStale, reimportSource } from './sources/importXml';
import { WindowManager } from './windows';

export interface ApiContext {
  config: AppConfigStore;
  session: LibrarySession;
  windows: WindowManager;
  presenter: PresenterHub;
  logger: Logger;
  icons: IconResources;
}

/** The main-process implementation of `TrifoldApi`. Registered by `registerIpc`. */
export function createApi(ctx: ApiContext): TrifoldApi {
  const requireStore = () => {
    const store = ctx.session.store;
    if (!store) throw new Error('No Library is open');
    return store;
  };
  let importing = false;
  const requireBackups = () => {
    const backups = ctx.session.backups;
    if (!backups) throw new Error('No Library is open');
    return backups;
  };

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
      async saveTextFile({ title, defaultName, text }) {
        const result = await dialog.showSaveDialog({
          title,
          defaultPath: join(app.getPath('documents'), defaultName),
          filters: [{ name: 'Text', extensions: ['txt'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await writeFile(result.filePath, text, 'utf8');
        return result.filePath;
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
        return reopenLibrary(ctx, path);
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
        const catalog = ctx.session.catalog;
        if (!catalog) return [];
        return (await catalog.list()).map((s) => ({
          ...s,
          stale: s.kind !== 'srd' && isStale(s),
          bundled: s.kind === 'srd',
        }));
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
      async reimport(sourceId) {
        if (importing) throw new Error('An import is already running');
        const { store, sources, index } = ctx.session.require();
        importing = true;
        try {
          return await reimportSource(
            {
              store,
              sources,
              index,
              logger: ctx.logger,
              onProgress: (p) => ctx.windows.sendToConsole(EVENT_CHANNELS.importProgress, p),
            },
            sourceId,
          );
        } finally {
          importing = false;
        }
      },
      async setEnabled(sourceId, enabled) {
        const { store, sources, bundled, index } = ctx.session.require();
        if (bundled.has(sourceId)) {
          const disabled = store.getSettings().disabledSourceIds.filter((id) => id !== sourceId);
          await store.updateSettings({
            disabledSourceIds: enabled ? disabled : [...disabled, sourceId],
          });
          index.setSourceEnabled(sourceId, enabled);
          const updated = bundled
            .sources(store.getSettings().disabledSourceIds)
            .find((s) => s.id === sourceId);
          if (!updated) throw new Error(`Bundled source ${sourceId} not found`);
          return updated;
        }
        const source = await sources.get(sourceId);
        if (!source) throw new Error(`Source ${sourceId} not found`);
        const next = { ...source, enabled };
        await sources.write(next);
        index.setSourceEnabled(sourceId, enabled);
        return next;
      },
      async remove(sourceId) {
        const { sources, bundled, index } = ctx.session.require();
        if (bundled.has(sourceId))
          throw new Error('Bundled SRD content can be switched off but not removed');
        await sources.remove(sourceId);
        index.removeSource(sourceId);
        ctx.logger.info(`source ${sourceId} removed`);
      },
      async rebuildIndex() {
        const { store, catalog, index } = ctx.session.require();
        return syncIndex(index, catalog, store, ctx.logger, true);
      },
      async attribution() {
        return ctx.session.bundled.attribution();
      },
    },

    ...createCampaignApi(ctx.session, ctx.logger),
    ...createMusicApi(ctx.session, ctx.windows),

    backups: {
      async list() {
        return requireBackups().list();
      },
      async create() {
        return requireBackups().create('manual');
      },
      async restore(name) {
        const service = requireBackups();
        const root = requireStore().root;
        await service.restore(name);
        // Reopen so the index is rebuilt from the restored files.
        return reopenLibrary(ctx, root);
      },
      async openFolder() {
        const error = await shell.openPath(requireBackups().dir);
        if (error) throw new Error(error);
      },
    },

    icons: {
      async tables() {
        return ctx.icons.tables();
      },
      async available() {
        return [...ctx.icons.available()];
      },
      async credits() {
        return ctx.icons.credits();
      },
      async reportMiss(kind, name) {
        await ctx.icons.reportMiss(kind, name);
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
