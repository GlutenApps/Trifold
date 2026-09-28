import { create } from 'zustand';
import type { CampaignBundle, CampaignImportReport, CampaignSummary } from '@trifold/api';
import type { Campaign, Encounter, PCCard, Scene, SceneImage } from '@trifold/schema';

interface CampaignState {
  campaigns: CampaignSummary[];
  current: CampaignBundle | null;
  loading: boolean;
  importing: boolean;
  lastImport: CampaignImportReport | null;
  error: string | null;

  load(): Promise<void>;
  importXml(mode: 'new' | 'merge'): Promise<void>;
  removeNote(noteId: string): Promise<void>;
  removeNpc(npcId: string): Promise<void>;
  removeAdventure(adventureId: string): Promise<void>;
  saveScene(scene: Scene): Promise<Scene | null>;
  saveScenes(scenes: Scene[]): Promise<void>;
  removeScene(sceneId: string): Promise<void>;
  importSceneImage(): Promise<SceneImage | null>;
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
    importing: false,
    lastImport: null,
    error: null,

    async importXml(mode) {
      const path = await window.trifold.campaigns.chooseXmlFile().catch(() => null);
      if (!path) return;
      set({ importing: true, lastImport: null });
      await guard(async () => {
        const report = await window.trifold.campaigns.importXml(path, mode);
        const [campaigns, current] = await Promise.all([
          window.trifold.campaigns.list(),
          window.trifold.campaigns.current(),
        ]);
        set({ lastImport: report, campaigns, current });
      });
      set({ importing: false });
    },

    async saveScene(scene) {
      const saved = await guard(() => window.trifold.scenes.save(scene));
      const current = get().current;
      if (saved && current) {
        const others = current.scenes.filter((x) => x.id !== saved.id);
        set({ current: { ...current, scenes: [...others, saved] } });
      }
      return saved;
    },

    async saveScenes(scenes) {
      for (const scene of scenes) await get().saveScene(scene);
    },

    async removeScene(sceneId) {
      await guard(async () => {
        await window.trifold.scenes.remove(sceneId);
        const current = get().current;
        if (current) {
          set({
            current: {
              ...current,
              scenes: current.scenes
                .filter((x) => x.id !== sceneId)
                .map((x) => (x.parentId === sceneId ? { ...x, parentId: null } : x)),
            },
          });
        }
      });
    },

    async importSceneImage() {
      return guard(() => window.trifold.scenes.importImage());
    },

    async removeNote(noteId) {
      await guard(async () => {
        await window.trifold.notes.remove(noteId);
        const current = get().current;
        if (current)
          set({ current: { ...current, notes: current.notes.filter((n) => n.id !== noteId) } });
      });
    },

    async removeNpc(npcId) {
      await guard(async () => {
        await window.trifold.npcs.remove(npcId);
        const current = get().current;
        if (current)
          set({ current: { ...current, npcs: current.npcs.filter((n) => n.id !== npcId) } });
      });
    },

    async removeAdventure(adventureId) {
      await guard(async () => {
        await window.trifold.adventures.remove(adventureId);
        const current = get().current;
        if (current) {
          set({
            current: {
              ...current,
              adventures: current.adventures.filter((a) => a.id !== adventureId),
            },
          });
        }
      });
    },

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
