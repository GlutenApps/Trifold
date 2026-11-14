import { dialog } from 'electron';
import type { TrifoldApi } from '@trifold/api';
import { CampaignEntities } from './campaign/entities';
import { importSceneImage } from './campaign/images';
import { importCampaignXml } from './campaign/importCampaign';
import { syncIndex } from './index/sync';
import type { LibrarySession } from './library/session';
import { errorMessage, type Logger } from './log';

/**
 * Campaign, PC card, encounter, note, NPC, scene, counter, timer and pinned-roll namespaces, backed by `CampaignRepository`,
 * `CampaignEntities`, `CampaignPackager` and the campaign XML importer.
 */
export function createCampaignApi(
  session: LibrarySession,
  logger: Logger,
): Pick<
  TrifoldApi,
  | 'campaigns'
  | 'pcs'
  | 'encounters'
  | 'notes'
  | 'npcs'
  | 'scenes'
  | 'counters'
  | 'timers'
  | 'pinnedRolls'
> {
  const repo = () => {
    const campaigns = session.campaigns;
    if (!campaigns) throw new Error('No Library is open');
    return campaigns;
  };
  const entities = () => new CampaignEntities(repo());
  const packager = () => session.packager();
  return {
    campaigns: {
      async list() {
        return repo().list();
      },
      async create(name) {
        return repo().create(name);
      },
      async open(campaignId) {
        return repo().open(campaignId);
      },
      async current() {
        const campaigns = session.campaigns;
        if (!campaigns) return null;
        return campaigns.current ? campaigns.bundle() : campaigns.reopenLast();
      },
      async bundles() {
        const out = [];
        for (const summary of await repo().list()) {
          try {
            out.push(await repo().bundleOf(summary.slug));
          } catch (err) {
            logger.warn(`Search skipped campaign ${summary.slug}: ${errorMessage(err)}`);
          }
        }
        return out;
      },
      async close() {
        await repo().close();
      },
      async update(patch) {
        return repo().updateCampaign(patch);
      },
      async remove(campaignId) {
        await repo().remove(campaignId);
      },
      async chooseXmlFile() {
        const result = await dialog.showOpenDialog({
          title: 'Import a Game Master campaign XML file',
          properties: ['openFile'],
          filters: [
            { name: 'Game Master campaign XML', extensions: ['xml'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      async importXml(path, mode) {
        const { store, sources, index } = session.require();
        return importCampaignXml({ store, sources, index, campaigns: repo(), logger }, path, mode);
      },
      async exportPreview(campaignId, options) {
        return packager().preview(campaignId, options);
      },
      async exportTo(campaignId, options) {
        const slug = await repo().slugFor(campaignId);
        const { campaign } = await repo().bundleOf(slug);
        const result = await dialog.showSaveDialog({
          title: 'Export campaign',
          // Characters Windows refuses in a file name.
          defaultPath: `${campaign.name.replace(/[\\/:*?"<>|]/g, '')}.trifold-campaign`,
          filters: [{ name: 'Trifold campaign', extensions: ['trifold-campaign'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await packager().exportTo(campaignId, options, result.filePath);
        return result.filePath;
      },
      async choosePackage() {
        const result = await dialog.showOpenDialog({
          title: 'Import a campaign',
          properties: ['openFile'],
          filters: [{ name: 'Trifold campaign', extensions: ['trifold-campaign'] }],
        });
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        return path ? packager().inspect(path) : null;
      },
      async importPackage(path, mode) {
        const imported = await packager().importFrom(path, mode);
        if (imported.homebrewAdded > 0) {
          const { store, catalog, index } = session.require();
          await syncIndex(index, catalog, store, logger);
        }
        return imported;
      },
      async sample() {
        return session.sample.status(packager());
      },
      async addSample() {
        return session.sample.add(session.require().store, packager());
      },
    },
    pcs: {
      async save(pc) {
        return repo().savePc(pc);
      },
      async remove(pcId) {
        await repo().removePc(pcId);
      },
      async copyFrom(campaignId, pcId) {
        return repo().copyPcFrom(campaignId, pcId);
      },
    },
    encounters: {
      async save(encounter) {
        return repo().saveEncounter(encounter);
      },
      async remove(encounterId) {
        await repo().removeEncounter(encounterId);
      },
      async saveState(encounterId, state) {
        return repo().saveCombatState(encounterId, state);
      },
      async finish(encounterId, result) {
        return repo().finishEncounter(encounterId, result);
      },
    },
    notes: {
      async save(note) {
        return entities().saveNote(note);
      },
      async remove(id, contents) {
        await entities().removeNote(id, contents);
      },
      async move(noteId, parentId, index) {
        return entities().moveNote(noteId, parentId, index);
      },
      async capture(input) {
        return entities().captureNote(input);
      },
    },
    npcs: {
      async save(npc) {
        return entities().saveNpc(npc);
      },
      async remove(id) {
        await entities().removeNpc(id);
      },
      async copyFrom(campaignId, npcId) {
        return entities().copyNpcFrom(campaignId, npcId);
      },
    },
    counters: {
      async save(counter) {
        return entities().saveCounter(counter);
      },
      async remove(id) {
        await entities().removeCounter(id);
      },
      async move(counterId, index) {
        return entities().moveCounter(counterId, index);
      },
    },
    timers: {
      async save(timer) {
        return entities().saveTimer(timer);
      },
      async remove(id) {
        await entities().removeTimer(id);
      },
      async move(timerId, index) {
        return entities().moveTimer(timerId, index);
      },
    },
    pinnedRolls: {
      async save(pin) {
        return entities().savePinnedRoll(pin);
      },
      async remove(id) {
        await entities().removePinnedRoll(id);
      },
    },
    scenes: {
      async save(scene) {
        return entities().saveScene(scene);
      },
      async remove(id) {
        await entities().removeScene(id);
      },
      async importImage() {
        const slug = repo().current;
        if (!slug) throw new Error('Open a campaign first');
        const result = await dialog.showOpenDialog({
          title: 'Choose a scene image',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });
        const path = result.canceled ? null : (result.filePaths[0] ?? null);
        if (!path) return null;
        const { store } = session.require();
        return importSceneImage(store, slug, path);
      },
    },
  };
}
