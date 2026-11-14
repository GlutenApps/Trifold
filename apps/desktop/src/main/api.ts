import { app, dialog, shell } from 'electron';
import { reviewBooks, sourceOrder, type BookReview } from '@trifold/rules';
import type { Source } from '@trifold/schema';
import { reopenLibrary } from './libraryOpen';
import { EVENT_CHANNELS, type TrifoldApi } from '@trifold/api';
import type { AppConfigStore } from './appConfig';
import { copyStatus } from './backupCopy';
import { createCampaignApi } from './campaignApi';
import { createMusicApi } from './musicApi';
import { createNoteTemplatesApi } from './noteTemplates';
import { createPhoneAudioApi } from './phoneAudio/phoneAudioApi';
import type { PhoneAudioReceiver } from './phoneAudio/receiver';
import type { IconResources } from './icons';
import { syncIndex } from './index/sync';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';
import type { PresenterHub } from './presenter';
import { importXmlSource, isStale, reimportSource } from './sources/importXml';
import { systemPageUrl } from './systemPages';
import { isWebUrl } from './webTabs';
import type { SaveFlush } from './saveFlush';
import type { UpdateService } from './updates';
import { WindowManager } from './windows';

/**
 * Where `TrifoldApi` (packages/api) is implemented for the main process. Each namespace maps
 * onto a repository or service held by `ApiContext`; the campaign, note-template, music and
 * phone-audio namespaces are built in their own modules and spread in. `registerIpc` turns the
 * result into IPC handlers. See `createApi` below.
 */
export interface ApiContext {
  config: AppConfigStore;
  session: LibrarySession;
  windows: WindowManager;
  presenter: PresenterHub;
  logger: Logger;
  icons: IconResources;
  phoneAudio: PhoneAudioReceiver;
  saves: SaveFlush;
  updates: UpdateService;
}

/** The main-process implementation of `TrifoldApi`. Registered by `registerIpc`. */
export function createApi(ctx: ApiContext): TrifoldApi {
  const requireStore = () => {
    const store = ctx.session.store;
    if (!store) throw new Error('No Library is open');
    return store;
  };
  let importing = false;
  // An imported file's books and clashes (ADR 0028), read once per import of it.
  const reviews = new Map<string, BookReview>();
  const reviewSource = async (source: Source): Promise<BookReview | undefined> => {
    const repo = ctx.session.sources;
    if (!repo) return undefined;
    const cacheKey = `${source.id}:${source.importedAt}`;
    const cached = reviews.get(cacheKey);
    if (cached) return cached;
    try {
      const review = reviewBooks(await repo.readAllRecords(source.id));
      reviews.set(cacheKey, review);
      return review;
    } catch (err) {
      ctx.logger.warn(`could not review the books in source ${source.id}: ${String(err)}`);
      return undefined;
    }
  };
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
      async openSystemPage(page) {
        const url = systemPageUrl(page, process.platform);
        if (!url) return false;
        await shell.openExternal(url);
        return true;
      },
      async openExternal(url) {
        if (!isWebUrl(url)) return false;
        await shell.openExternal(url);
        return true;
      },
      async savesFlushed() {
        ctx.saves.acknowledge();
      },
    },
    updates: {
      async status() {
        return ctx.updates.status();
      },
      async setEnabled(enabled) {
        return ctx.updates.setEnabled(enabled);
      },
      async checkNow() {
        return ctx.updates.check('manual');
      },
      async dismiss() {
        return ctx.updates.dismiss();
      },
      async openDownload() {
        const url = ctx.updates.downloadUrl();
        if (!url) return false;
        await shell.openExternal(url);
        return true;
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
      async updateSettings(patch) {
        const settings = await requireStore().updateSettings(patch);
        if (patch.theme) ctx.windows.setTheme(settings.theme);
        if (patch.sourcePriority) {
          const { index, catalog } = ctx.session.require();
          index.applySourceOrder(sourceOrder(await catalog.list(), settings.sourcePriority));
        }
        return settings;
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
        const out = [];
        for (const s of await catalog.list()) {
          const bundled = s.kind === 'srd' || s.kind === 'homebrew';
          out.push({
            ...s,
            stale: !bundled && isStale(s),
            bundled,
            ...(bundled ? {} : { review: await reviewSource(s) }),
          });
        }
        return out;
      },
      async chooseFile() {
        const result = await dialog.showOpenDialog({
          title: 'Import a Game Master compendium XML file',
          properties: ['openFile'],
          filters: [
            { name: 'Game Master compendium XML', extensions: ['xml'] },
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
      async setEdition2024Books(sourceId, books) {
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
            books,
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
    ...createNoteTemplatesApi(ctx.session, ctx.logger),
    ...createMusicApi(ctx.session, ctx.windows),
    ...createPhoneAudioApi(ctx.phoneAudio, ctx.config, ctx.logger),

    homebrew: {
      async duplicate(recordId) {
        const { index, catalog, store } = ctx.session.require();
        const homebrew = ctx.session.homebrew;
        if (!homebrew) throw new Error('No Library is open');
        const original = index.get(recordId);
        if (!original) throw new Error('Record not found');
        const copy = await homebrew.duplicate(original);
        await syncIndex(index, catalog, store, ctx.logger);
        return copy;
      },
      async save(record) {
        const { index, catalog, store } = ctx.session.require();
        const homebrew = ctx.session.homebrew;
        if (!homebrew) throw new Error('No Library is open');
        const saved = await homebrew.save(record);
        await syncIndex(index, catalog, store, ctx.logger);
        return saved;
      },
      async remove(recordId) {
        const { index, catalog, store } = ctx.session.require();
        const homebrew = ctx.session.homebrew;
        if (!homebrew) throw new Error('No Library is open');
        await homebrew.remove(recordId);
        await syncIndex(index, catalog, store, ctx.logger);
      },
    },

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
      async chooseFile() {
        const service = requireBackups();
        const result = await dialog.showOpenDialog({
          title: 'Restore a Library backup',
          properties: ['openFile'],
          filters: [{ name: 'Trifold backup', extensions: ['zip'] }],
        });
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        return path ? service.inspect(path) : null;
      },
      async restoreFile(path) {
        const service = requireBackups();
        const root = requireStore().root;
        await service.restoreFile(path);
        return reopenLibrary(ctx, root);
      },
      async copyStatus() {
        return copyStatus(ctx.config, ctx.session);
      },
      async chooseCopyFolder() {
        const result = await dialog.showOpenDialog({
          title: 'Also copy backups to',
          properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        });
        const folder = result.canceled ? null : (result.filePaths[0] ?? null);
        if (folder) {
          await ctx.config.update({ backupCopy: { folder, lastCopyAt: null, lastError: null } });
          ctx.logger.info(`backups will also be copied to ${folder}`);
        }
        return copyStatus(ctx.config, ctx.session);
      },
      async stopCopying() {
        await ctx.config.update({
          backupCopy: { folder: null, lastCopyAt: null, lastError: null },
        });
        return copyStatus(ctx.config, ctx.session);
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
      async suggest(text, opts) {
        return ctx.session.require().index.suggest(text, opts);
      },
      async searchText(text, opts) {
        return ctx.session.require().index.searchText(text, opts);
      },
    },
  };
}
