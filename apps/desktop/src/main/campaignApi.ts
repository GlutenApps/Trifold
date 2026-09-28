import { dialog } from 'electron';
import type { TrifoldApi } from '@trifold/api';
import { CampaignEntities } from './campaign/entities';
import { importSceneImage } from './campaign/images';
import { importCampaignXml } from './campaign/importCampaign';
import type { LibrarySession } from './library/session';
import type { Logger } from './log';

/** Campaign, PC card, encounter, adventure, note and NPC namespaces, backed by CampaignRepository. */
export function createCampaignApi(
  session: LibrarySession,
  logger: Logger,
): Pick<
  TrifoldApi,
  'campaigns' | 'pcs' | 'encounters' | 'adventures' | 'notes' | 'npcs' | 'scenes'
> {
  const repo = () => {
    const campaigns = session.campaigns;
    if (!campaigns) throw new Error('No Library is open');
    return campaigns;
  };
  const entities = () => new CampaignEntities(repo());
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
      async close() {
        await repo().close();
      },
      async update(patch) {
        return repo().updateCampaign(patch);
      },
      async chooseXmlFile() {
        const result = await dialog.showOpenDialog({
          title: 'Import a campaign XML file',
          properties: ['openFile'],
          filters: [
            { name: 'Campaign XML', extensions: ['xml'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      async importXml(path, mode) {
        const { store, sources, index } = session.require();
        return importCampaignXml({ store, sources, index, campaigns: repo(), logger }, path, mode);
      },
    },
    pcs: {
      async save(pc) {
        return repo().savePc(pc);
      },
      async remove(pcId) {
        await repo().removePc(pcId);
      },
      async quickAdd(text) {
        return repo().quickAdd(text);
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
    adventures: {
      async save(adventure) {
        return entities().saveAdventure(adventure);
      },
      async remove(id) {
        await entities().removeAdventure(id);
      },
    },
    notes: {
      async save(note) {
        return entities().saveNote(note);
      },
      async remove(id) {
        await entities().removeNote(id);
      },
    },
    npcs: {
      async save(npc) {
        return entities().saveNpc(npc);
      },
      async remove(id) {
        await entities().removeNpc(id);
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
