import { create } from 'zustand';
import type { CampaignBundle, CampaignSummary } from '@trifold/api';
import type { Campaign, Encounter, PCCard } from '@trifold/schema';

interface CampaignState {
  campaigns: CampaignSummary[];
  current: CampaignBundle | null;
  loading: boolean;
  error: string | null;

  load(): Promise<void>;
  create(name: string): Promise<void>;
  open(campaignId: string): Promise<void>;
  close(): Promise<void>;
  update(patch: Partial<Campaign>): Promise<void>;
  quickAdd(text: string): Promise<PCCard[]>;
  savePc(pc: PCCard): Promise<void>;
  removePc(pcId: string): Promise<void>;
  saveEncounter(encounter: Encounter): Promise<Encounter | null>;
  removeEncounter(encounterId: string): Promise<void>;
  /** Replace one encounter in the bundle without a round trip (after autosaves). */
  putEncounter(encounter: Encounter): void;
  clearError(): void;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useCampaignStore = create<CampaignState>((set, get) => {
  const guard = async <T>(task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (err) {
      set({ error: messageOf(err) });
      return null;
    }
  };
  const refreshList = async () => set({ campaigns: await window.trifold.campaigns.list() });

  return {
    campaigns: [],
    current: null,
    loading: false,
    error: null,

    async load() {
      set({ loading: true });
      await guard(async () => {
        const [campaigns, current] = await Promise.all([
          window.trifold.campaigns.list(),
          window.trifold.campaigns.current(),
        ]);
        set({ campaigns, current, error: null });
      });
      set({ loading: false });
    },

    async create(name) {
      await guard(async () => {
        set({ current: await window.trifold.campaigns.create(name) });
        await refreshList();
      });
    },

    async open(campaignId) {
      await guard(async () => {
        set({ current: await window.trifold.campaigns.open(campaignId) });
      });
    },

    async close() {
      await guard(async () => {
        await window.trifold.campaigns.close();
        set({ current: null });
        await refreshList();
      });
    },

    async update(patch) {
      await guard(async () => {
        const campaign = await window.trifold.campaigns.update(patch);
        const current = get().current;
        if (current) set({ current: { ...current, campaign } });
      });
    },

    async quickAdd(text) {
      const added = await guard(() => window.trifold.pcs.quickAdd(text));
      if (added) {
        const current = get().current;
        if (current) {
          set({
            current: {
              ...current,
              pcs: [...current.pcs, ...added].sort((a, b) => a.name.localeCompare(b.name)),
            },
          });
        }
      }
      return added ?? [];
    },

    async savePc(pc) {
      const saved = await guard(() => window.trifold.pcs.save(pc));
      const current = get().current;
      if (saved && current) {
        const others = current.pcs.filter((p) => p.id !== saved.id);
        set({
          current: {
            ...current,
            pcs: [...others, saved].sort((a, b) => a.name.localeCompare(b.name)),
          },
        });
      }
    },

    async removePc(pcId) {
      await guard(async () => {
        await window.trifold.pcs.remove(pcId);
        const current = get().current;
        if (current)
          set({ current: { ...current, pcs: current.pcs.filter((p) => p.id !== pcId) } });
      });
    },

    async saveEncounter(encounter) {
      const saved = await guard(() => window.trifold.encounters.save(encounter));
      if (saved) get().putEncounter(saved);
      return saved;
    },

    async removeEncounter(encounterId) {
      await guard(async () => {
        await window.trifold.encounters.remove(encounterId);
        const current = get().current;
        if (current) {
          set({
            current: {
              ...current,
              encounters: current.encounters.filter((e) => e.id !== encounterId),
            },
          });
        }
      });
    },

    putEncounter(encounter) {
      const current = get().current;
      if (!current) return;
      const others = current.encounters.filter((e) => e.id !== encounter.id);
      set({
        current: {
          ...current,
          encounters: [encounter, ...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        },
      });
    },

    clearError() {
      set({ error: null });
    },
  };
});
