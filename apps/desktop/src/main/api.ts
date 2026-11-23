import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, shell } from 'electron';
import { reviewBooks, type BookReview } from '@trifold/rules';
import { TEXT_SIZE_ZOOM, type Source } from '@trifold/schema';
import { reopenLibrary } from './libraryOpen';
import type { SharingOverview } from '@trifold/api';
import type { JoinedService } from './joined/service';
import { EVENT_CHANNELS, featureFlags, type TrifoldApi } from '@trifold/api';
import type { AppConfigStore } from './appConfig';
import { copyStatus } from './backupCopy';
import { createCampaignApi } from './campaignApi';
import { createArtApi } from './art';
import { createMusicApi } from './musicApi';
import { createNoteTemplatesApi } from './noteTemplates';
import { createCharactersApi } from './characters';
import { createPhoneAudioApi } from './phoneAudio/phoneAudioApi';
import type { PhoneAudioReceiver } from './phoneAudio/receiver';
import type { IconResources } from './icons';
import { markLibraryChoices, syncIndex } from './index/sync';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';
import type { PresenterHub } from './presenter';
import type { TableHub } from './table/hub';
import { canLimitToCampaigns } from './sources/campaignScope';
import { importXmlSource, isStale, reimportSource } from './sources/importXml';
import { listBooks, with2024Books, withBookSettings } from './sources/books';
import { deleteBooks, withoutDeletedChoices } from './sources/deleteBooks';
import { PLAYER_PACK_EXTENSION } from './table/playerPack';
import { campaignBooks } from '@trifold/rules';
import { listDuplicates } from './sources/duplicates';
import { systemPageUrl } from './systemPages';
import { isWebUrl } from './webTabs';
import type { SaveFlush } from './saveFlush';
import { HOMEBREW_SOURCE_ID } from './sources/homebrew';
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
  table: TableHub;
  joined: JoinedService;
  logger: Logger;
  icons: IconResources;
  phoneAudio: PhoneAudioReceiver;
  saves: SaveFlush;
  updates: UpdateService;
  /** Restart to update (ADR 0045): the close flow, then the installer; false when none is ready. */
  restartToUpdate: () => Promise<boolean>;
}

/** The recent Libraries list (ADR 0054): up to five, newest first, without the open one. */
async function recentLibraries(ctx: ApiContext) {
  const open = ctx.session.store?.root ?? ctx.config.get().libraryPath;
  const paths = ctx.config
    .get()
    .recentLibraries.filter((p) => p !== open)
    .slice(0, 5);
  return Promise.all(
    paths.map(async (path) => ({
      path,
      exists: await stat(path).then(
        (s) => s.isDirectory(),
        () => false,
      ),
    })),
  );
}

/** The main-process implementation of `TrifoldApi`. Registered by `registerIpc`. */
export function createApi(ctx: ApiContext): TrifoldApi {
  const requireStore = () => {
    const store = ctx.session.store;
    if (!store) throw new Error('No Library is open');
    return store;
  };
  /**
   * The source the compendium is scoped to besides the ones every campaign sees: the open
   * campaign's own creatures (ADR 0035), or the open joined campaign's shared content (ADR 0060).
   */
  const scopeSourceId = () => ctx.session.openCampaignSourceId() ?? ctx.joined.openSharedSourceId();
  /** Shared sources and homebrew across every campaign (ADR 0060). */
  const sharingOverview = async (): Promise<SharingOverview> => {
    const bySource: Record<string, string[]> = {};
    const byCollection: Record<string, string[]> = {};
    const byBook: Record<string, string[]> = {};
    const homebrewByCampaign: Record<string, number> = {};
    for (const { campaign } of (await ctx.session.campaigns?.allCampaigns()) ?? []) {
      for (const id of campaign.settings.shared.sourceIds) {
        (bySource[id] ??= []).push(campaign.id);
      }
      for (const id of campaign.settings.shared.collectionIds) {
        (byCollection[id] ??= []).push(campaign.id);
      }
      for (const key of campaign.settings.shared.bookKeys) {
        (byBook[key] ??= []).push(campaign.id);
      }
      const homebrew = campaign.settings.shared.homebrewIds.length;
      if (homebrew > 0) homebrewByCampaign[campaign.id] = homebrew;
    }
    return { bySource, byCollection, byBook, homebrewByCampaign };
  };

  /** Whether a source's original file is kept, so Re-parse has something to read. */
  const canReparse = async (source: Source): Promise<boolean> => {
    const sources = ctx.session.sources;
    if (source.kind !== 'xml' || !sources) return false;
    try {
      await stat(join(sources.dirFor(source.id), source.filePath ?? 'original.xml'));
      return true;
    } catch {
      return false;
    }
  };
  /** The open campaign's books from the Library's collections (ADR 0062); null for every book. */
  const openCampaignBooks = () =>
    campaignBooks(ctx.session.store?.getSettings().collections ?? [], ctx.session.openCampaignId());
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
  const requireHomebrew = () => {
    const homebrew = ctx.session.homebrew;
    if (!homebrew) throw new Error('No Library is open');
    return homebrew;
  };
  /** The open campaign's creatures (ADR 0035). */
  const openCampaignCreatures = async () => {
    const sourceId = ctx.session.openCampaignSourceId();
    const folder = sourceId ? await ctx.session.creaturesFor(sourceId) : null;
    if (!folder) throw new Error('Open a campaign first');
    return folder;
  };
  /** Where a record of this source is saved: the Library's homebrew or a campaign's creatures. */
  const folderFor = async (sourceId: string) => {
    if (sourceId === HOMEBREW_SOURCE_ID) return requireHomebrew();
    const folder = sourceId.startsWith('campaign:')
      ? await ctx.session.creaturesFor(sourceId)
      : null;
    if (!folder) throw new Error('Only your own records can be changed');
    return folder;
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
          flags: featureFlags(process.env),
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
      async textSize() {
        return ctx.config.get().textSize;
      },
      async setTextSize(size) {
        const saved = await ctx.config.update({ textSize: size });
        ctx.windows.setConsoleZoom(TEXT_SIZE_ZOOM[saved.textSize]);
        return saved.textSize;
      },
      async thirdPartyNotices() {
        // Packaged: resources/licenses (electron-builder.yml); in development: the build's out/.
        const file = app.isPackaged
          ? join(process.resourcesPath, 'licenses', 'THIRD_PARTY_NOTICES.txt')
          : join(app.getAppPath(), 'out', 'THIRD_PARTY_NOTICES.txt');
        return readFile(file, 'utf8').catch(() => null);
      },
      async reportError(where, detail) {
        // From the window, so it is held to a size and to text before it is written.
        ctx.logger.error(
          `window: ${String(where).slice(0, 80)} stopped: ${String(detail).slice(0, 4000)}`,
        );
      },
      async openLogsFolder() {
        const dir = ctx.session.logDir ?? join(app.getPath('userData'), 'logs');
        await mkdir(dir, { recursive: true });
        const error = await shell.openPath(dir);
        if (error) throw new Error(error);
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
      async restartToUpdate() {
        return ctx.restartToUpdate();
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
      async recent() {
        return recentLibraries(ctx);
      },
      async forgetRecent(path) {
        await ctx.config.update({
          recentLibraries: ctx.config.get().recentLibraries.filter((p) => p !== path),
        });
        return recentLibraries(ctx);
      },
      async updateSettings(patch) {
        const settings = await requireStore().updateSettings(patch);
        if (patch.theme) ctx.windows.setTheme(settings.theme);
        // Books and settled duplicates are marked on the index's records (ADR 0061, ADR 0063).
        if (patch.books) ctx.session.require().index.applyBookSettings(settings.books);
        if (patch.duplicateChoices) {
          ctx.session.require().index.applyChoices(settings.duplicateChoices);
        }
        return settings;
      },
    },

    displays: {
      async list() {
        return WindowManager.listDisplays();
      },
      async identify() {
        WindowManager.identifyDisplays();
      },
    },

    player: {
      async open(displayId) {
        const preferred = displayId ?? ctx.session.store?.getSettings().playerDisplayId ?? null;
        ctx.windows.openPlayer(WindowManager.pickDisplay(preferred));
      },
      async openForLive() {
        const preferred = ctx.session.store?.getSettings().playerDisplayId ?? null;
        const display = WindowManager.liveDisplay(preferred);
        // Say which display the TV went to, or why none, so a TV that did not open can be traced.
        const count = WindowManager.listDisplays().length;
        ctx.logger.info(
          display
            ? `going live: the TV opens on display ${display.id}${display.id === preferred ? ' (chosen in Settings)' : ''}`
            : `going live: no TV window (${count} display${count === 1 ? '' : 's'}, ${preferred === null ? 'Automatic' : `display ${preferred} not attached`})`,
        );
        if (display) ctx.windows.openPlayer(display);
        return display !== null;
      },
      async close() {
        ctx.windows.closePlayer();
      },
      async isOpen() {
        return ctx.windows.isPlayerOpen();
      },
    },

    joined: {
      list: () => ctx.joined.list(),
      startSearch: () => ctx.joined.startSearch(),
      async stopSearch() {
        ctx.joined.stopSearch();
      },
      peek: (address) => ctx.joined.peek(address),
      join: (input) => ctx.joined.join(input),
      leave: (campaignId) => ctx.joined.leave(campaignId),
      linkCharacter: (campaignId, characterId) => ctx.joined.linkCharacter(campaignId, characterId),
      open: (campaignId) => ctx.joined.open(campaignId),
      async close(campaignId) {
        ctx.joined.close(campaignId);
      },
      async send(campaignId, message) {
        ctx.joined.send(campaignId, message);
      },
      async choosePack() {
        const result = await dialog.showOpenDialog({
          title: 'Open a player pack',
          properties: ['openFile'],
          filters: [{ name: 'Trifold player pack', extensions: [PLAYER_PACK_EXTENSION] }],
        });
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        return path ? ctx.joined.inspectPack(path) : null;
      },
      openPack: (path, displayName) => ctx.joined.openPack(path, displayName.trim().slice(0, 40)),
      changeAddress: (campaignId, address) => ctx.joined.changeAddress(campaignId, address),
      lastView: (campaignId) => ctx.joined.lastView(campaignId),
      notes: (campaignId) => ctx.joined.notes(campaignId),
      saveNote: (campaignId, note) => ctx.joined.saveNote(campaignId, note),
      removeNote: (campaignId, id) => ctx.joined.removeNote(campaignId, id),
      pinnedRolls: (campaignId) => ctx.joined.pinnedRolls(campaignId),
      savePinnedRoll: (campaignId, pin) => ctx.joined.savePinnedRoll(campaignId, pin),
      removePinnedRoll: (campaignId, id) => ctx.joined.removePinnedRoll(campaignId, id),
    },

    table: {
      status() {
        return Promise.resolve(ctx.table.status());
      },
      start(campaignId) {
        return ctx.table.start(campaignId);
      },
      stop() {
        return ctx.table.stop();
      },
      release(target) {
        return ctx.table.release(target);
      },
      push(snapshot) {
        ctx.table.push(snapshot);
        return Promise.resolve();
      },
      setMapImage(sceneId, imageKey, jpeg) {
        ctx.table.setMapImage(sceneId, imageKey, jpeg);
        return Promise.resolve();
      },
      setReclaimMode(mode) {
        return ctx.table.setReclaimMode(mode);
      },
      answer(requestId, accept) {
        return ctx.table.answer(requestId, accept);
      },
      dmGrab(tokenId) {
        ctx.table.dmGrab(tokenId);
        return Promise.resolve();
      },
      give(target, deviceId) {
        return ctx.table.give(target, deviceId);
      },
      setMovementLock(target, locked) {
        return ctx.table.setMovementLock(target, locked);
      },
      setSummoning(summoning) {
        return ctx.table.setSummoning(summoning);
      },
      answerSheet(requestId, accept) {
        return ctx.table.answerSheet(requestId, accept);
      },
      setSheetAutoAccept(on) {
        return ctx.table.setSheetAutoAccept(on);
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
          if (s.kind === 'campaign') continue;
          // Shared content (ADR 0060) is listed only for the joined campaign that is open, so
          // its compendium can filter by it. It is nobody's to manage: read-only, like the SRD.
          if (s.kind === 'shared' && s.id !== ctx.joined.openSharedSourceId()) continue;
          const bundled = s.kind === 'srd' || s.kind === 'homebrew' || s.kind === 'shared';
          out.push({
            ...s,
            // Only a file whose original is kept can be parsed again; one that came in with a
            // campaign has none, so it is not offered, however old its parser.
            stale: !bundled && isStale(s) && (await canReparse(s)),
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
          // A player's own copies may now stand in for shared ones (ADR 0060).
          void ctx.joined.ownSourcesChanged();
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
          // A player's own copies may now stand in for shared ones (ADR 0060).
          void ctx.joined.ownSourcesChanged();
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
          // A player's own copies may now stand in for shared ones (ADR 0060).
          void ctx.joined.ownSourcesChanged();
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
        // A file switched off no longer stands in for shared copies, and one switched on does.
        markLibraryChoices(index, store);
        void ctx.joined.ownSourcesChanged();
        return next;
      },
      async setCampaigns(sourceId, campaignIds) {
        const { sources, bundled, index } = ctx.session.require();
        const source = bundled.has(sourceId) ? null : await sources.get(sourceId);
        if (!source || !canLimitToCampaigns(source, false)) {
          throw new Error('Only an imported file can be limited to some campaigns');
        }
        if (campaignIds && campaignIds.length === 0) {
          throw new Error('Choose at least one campaign, or every campaign');
        }
        const next = { ...source, campaignIds: campaignIds ? [...new Set(campaignIds)] : null };
        await sources.write(next);
        index.setSourceCampaigns(sourceId, next.campaignIds);
        return next;
      },
      async sharing() {
        return sharingOverview();
      },
      async remove(sourceId) {
        const { sources, bundled, index } = ctx.session.require();
        if (bundled.has(sourceId))
          throw new Error('Bundled SRD content can be switched off but not removed');
        await sources.remove(sourceId);
        index.removeSource(sourceId);
        void ctx.joined.ownSourcesChanged();
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
    ...createCharactersApi(ctx.session, ctx.logger, (id) => ctx.joined.characterChanged(id)),
    ...createMusicApi(ctx.session, ctx.windows),
    ...createArtApi(ctx.session),
    ...createPhoneAudioApi(ctx.phoneAudio, ctx.config, ctx.logger),

    homebrew: {
      async draft(recordId, home = 'library') {
        const original = ctx.session.require().index.get(recordId);
        // Shared content is the GM's, lent to this campaign's players (ADR 0060): no copies.
        if (original?.sourceId.startsWith('shared:')) {
          throw new Error('Content your GM shared cannot be edited or copied.');
        }
        if (!original) throw new Error('Record not found');
        const folder = home === 'campaign' ? await openCampaignCreatures() : requireHomebrew();
        return folder.copyOf(original);
      },
      async save(record) {
        const { index, catalog, store } = ctx.session.require();
        const saved = await (await folderFor(record.sourceId)).save(record);
        await syncIndex(index, catalog, store, ctx.logger);
        // A homebrew change may be a change to what players are shared.
        ctx.table.sharedChanged();
        return saved;
      },
      async remove(recordId) {
        const { index, catalog, store } = ctx.session.require();
        const record = index.get(recordId);
        await (await folderFor(record?.sourceId ?? HOMEBREW_SOURCE_ID)).remove(recordId);
        await syncIndex(index, catalog, store, ctx.logger);
        // A homebrew change may be a change to what players are shared.
        ctx.table.sharedChanged();
      },
      async addToLibrary(recordId) {
        const { index, catalog, store } = ctx.session.require();
        const record = index.get(recordId);
        if (!record) throw new Error('Record not found');
        if (!record.sourceId.startsWith('campaign:'))
          throw new Error('Only a campaign creature can be added to the compendium');
        const added = await requireHomebrew().adopt(record);
        await syncIndex(index, catalog, store, ctx.logger);
        // A homebrew change may be a change to what players are shared.
        ctx.table.sharedChanged();
        return added;
      },
    },

    duplicates: {
      async list(query = {}) {
        const { index, store } = ctx.session.require();
        const prefer = (await ctx.session.campaigns?.bundle().catch(() => null))?.campaign
          .preferredEdition;
        return listDuplicates(
          index.duplicateRows(prefer === '2014' ? '2014' : '2024'),
          store.getSettings().duplicateChoices,
          query,
        );
      },
    },
    books: {
      async shareCollection(collectionId, campaignIds) {
        const repo = ctx.session.campaigns;
        if (!repo) throw new Error('No Library is open');
        const wanted = new Set(campaignIds);
        for (const { slug, campaign } of await repo.allCampaigns()) {
          const has = campaign.settings.shared.collectionIds.includes(collectionId);
          const want = wanted.has(campaign.id);
          if (has === want) continue;
          await repo.updateCampaignOf(slug, (c) => ({
            settings: {
              ...c.settings,
              shared: {
                ...c.settings.shared,
                collectionIds: want
                  ? [...c.settings.shared.collectionIds, collectionId]
                  : c.settings.shared.collectionIds.filter((id) => id !== collectionId),
              },
            },
          }));
        }
        ctx.table.sharedChanged();
        return sharingOverview();
      },
      async share(keys, campaignId, share) {
        const repo = ctx.session.campaigns;
        if (!repo) throw new Error('No Library is open');
        for (const { slug, campaign } of await repo.allCampaigns()) {
          if (campaign.id !== campaignId) continue;
          await repo.updateCampaignOf(slug, (c) => {
            const current = c.settings.shared.bookKeys;
            const bookKeys = share
              ? [...new Set([...current, ...keys])]
              : current.filter((k) => !keys.includes(k));
            return { settings: { ...c.settings, shared: { ...c.settings.shared, bookKeys } } };
          });
        }
        ctx.table.sharedChanged();
        return sharingOverview();
      },
      async list() {
        const { index, store } = ctx.session.require();
        return listBooks(index, store.getSettings().books);
      },
      async update(keys, patch) {
        const { index, store } = ctx.session.require();
        const books = withBookSettings(store.getSettings().books, keys, patch);
        await store.updateSettings({ books });
        index.applyBookSettings(books);
        void ctx.joined.ownSourcesChanged();
        return listBooks(index, books);
      },
      async setRules(keys, use2024) {
        if (importing) throw new Error('An import is already running');
        const { store, sources, index } = ctx.session.require();
        const wanted = new Set(keys);
        const affected = listBooks(index, store.getSettings().books).filter((b) =>
          wanted.has(b.key),
        );
        // A file's unnamed records have no book to mark.
        const named = affected.filter((b) => !b.unnamed);
        const fileIds = [...new Set(named.flatMap((b) => b.files.map((f) => f.id)))];
        importing = true;
        try {
          for (const id of fileIds) {
            const source = await sources.get(id);
            if (!source || !(await canReparse(source))) continue;
            const names = named.filter((b) => b.files.some((f) => f.id === id)).map((b) => b.name);
            const next = with2024Books(source.edition2024Books, names, use2024);
            if (JSON.stringify(next) === JSON.stringify(source.edition2024Books)) continue;
            await reimportSource(
              {
                store,
                sources,
                index,
                logger: ctx.logger,
                onProgress: (p) => ctx.windows.sendToConsole(EVENT_CHANNELS.importProgress, p),
              },
              id,
              next,
            );
          }
        } finally {
          importing = false;
          // A player's own copies may now stand in for shared ones (ADR 0060).
          void ctx.joined.ownSourcesChanged();
        }
        index.applyBookSettings(store.getSettings().books);
        return listBooks(index, store.getSettings().books);
      },
      async delete(keys) {
        if (importing) throw new Error('An import is already running');
        const { store, sources, index } = ctx.session.require();
        const wanted = new Set(keys);
        const before = listBooks(index, store.getSettings().books).filter((b) => wanted.has(b.key));
        const fileIds = [...new Set(before.flatMap((b) => b.files.map((f) => f.id)))];
        importing = true;
        let result: Awaited<ReturnType<typeof deleteBooks>>;
        try {
          result = await deleteBooks({ sources, index }, keys, fileIds);
        } finally {
          importing = false;
        }
        // A book still in another place (an opted-in document) keeps its settings.
        const left = new Set(listBooks(index, store.getSettings().books).map((b) => b.key));
        const gone = keys.filter((k) => !left.has(k));
        const settings = store.getSettings();
        const books = { ...settings.books };
        for (const k of gone) delete books[k];
        await store.updateSettings({
          books,
          collections: settings.collections.map((c) => ({
            ...c,
            bookKeys: c.bookKeys.filter((k) => !gone.includes(k)),
          })),
          duplicateChoices: withoutDeletedChoices(
            settings.duplicateChoices,
            keys,
            result.files,
            result.removedFiles,
          ),
        });
        markLibraryChoices(index, store);
        void ctx.joined.ownSourcesChanged();
        // What a table shares may have held those books.
        ctx.table.sharedChanged();
        ctx.logger.info(
          `deleted ${keys.length} book(s): ${result.records} records, ${result.removedFiles.length} file(s) emptied and removed`,
        );
        return listBooks(index, store.getSettings().books);
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
        return ctx.session.require().index.search({
          ...query,
          campaignSourceId: scopeSourceId(),
          campaignId: ctx.session.openCampaignId(),
          campaignBookKeys: openCampaignBooks(),
        });
      },
      async get(recordId) {
        return ctx.session.require().index.get(recordId);
      },
      async findByKey(kind, key) {
        return ctx.session
          .require()
          .index.findByKey(kind, key, false, ctx.session.openCampaignId(), openCampaignBooks());
      },
      async facets(kind) {
        return ctx.session.require().index.facets(kind);
      },
      async suggest(text, opts) {
        return ctx.session.require().index.suggest(text, {
          ...opts,
          campaignSourceId: scopeSourceId(),
          campaignId: ctx.session.openCampaignId(),
          campaignBookKeys: openCampaignBooks(),
        });
      },
      async searchText(text, opts) {
        return ctx.session.require().index.searchText(text, {
          ...opts,
          campaignSourceId: scopeSourceId(),
          campaignId: ctx.session.openCampaignId(),
          campaignBookKeys: openCampaignBooks(),
        });
      },
    },
  };
}
