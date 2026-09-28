import type { TrifoldApi } from '@trifold/api';
import type { LibrarySession } from './library/session';

/** The campaign, PC card and encounter namespaces of the API, backed by CampaignRepository. */
export function createCampaignApi(
  session: LibrarySession,
): Pick<TrifoldApi, 'campaigns' | 'pcs' | 'encounters'> {
  const repo = () => {
    const campaigns = session.campaigns;
    if (!campaigns) throw new Error('No Library is open');
    return campaigns;
  };
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
  };
}
