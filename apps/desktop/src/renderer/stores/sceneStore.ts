import { create } from 'zustand';
import type { Scene, Token } from '@trifold/schema';
import { scheduleSave } from './pendingSaves';
import { useCampaignStore } from './campaignStore';
import { useMusicStore } from './musicStore';
import { usePresenterStore } from './presenterStore';
import { useShellStore } from './shellStore';

/**
 * The scene the DM is working on, shared by the Scenes tool (tree, edit form) and the TV
 * major (canvas and preview). Selecting never sends anything to the TV (ADR 0004: click
 * selects, Enter sends). The draft autosaves to the campaign through the campaign store, and
 * while it is the live scene every edit mirrors to the TV; nothing else persists from here.
 */
interface SceneState {
  selectedId: string | null;
  hoverId: string | null;
  /** The selected scene with unsaved edits applied; autosaves and, when live, mirrors to the TV. */
  draft: Scene | null;

  select(id: string | null): void;
  setHover(id: string | null): void;
  setDraft(scene: Scene): void;
  /** Sends a scene to the TV (Enter, double-click, ▶, Send to TV) and starts its playlist. */
  send(scene: Scene): void;
  /**
   * Changes a saved scene wherever it is: the draft when it is the selected one (so the editor
   * and, when live, the TV follow at once), else the campaign's copy. The combat tracker uses
   * this to keep its tokens' hidden and dead flags in step (ADR 0012).
   */
  patchScene(sceneId: string, fn: (scene: Scene) => Scene): void;
  /** Patches one token in whichever scene holds it. */
  patchTokenAnywhere(tokenId: string, patch: Partial<Token>): void;
  /** Called when the campaign changes so nothing points at another campaign's scenes. */
  reset(): void;
}

export function isMapScene(scene: Scene | null): boolean {
  return !!scene && (scene.kind === 'map' || scene.kind === 'blankGrid');
}

export const useSceneStore = create<SceneState>((set, get) => ({
  selectedId: null,
  hoverId: null,
  draft: null,

  select(id) {
    const scene = useCampaignStore.getState().current?.scenes.find((s) => s.id === id) ?? null;
    set({ selectedId: scene ? id : null, draft: scene });
    // A map opens in the TV tab (in its own group; the other group is not disturbed).
    if (isMapScene(scene)) useShellStore.getState().openMajor('map', { avoid: 'encounters' });
  },

  setHover(id) {
    if (get().hoverId !== id) set({ hoverId: id });
  },

  setDraft(scene) {
    set({ draft: scene });
    const liveId = usePresenterStore.getState().state.scene?.id ?? null;
    if (scene.id === liveId) usePresenterStore.getState().syncLiveScene(scene);
    scheduleSave('scene', () => useCampaignStore.getState().saveScene(scene), 350);
  },

  send(scene) {
    if (scene.kind === 'folder') return;
    const slug = useCampaignStore.getState().current?.campaign.slug ?? '';
    const presenter = usePresenterStore.getState();
    if (presenter.showScene(scene, slug) && scene.audio?.playlistId) {
      // Scene-linked music (DESIGN.md §6.6): crossfade only when the playlist changes.
      void useMusicStore.getState().playPlaylist(scene.audio.playlistId, { ifDifferent: true });
    }
  },

  patchScene(sceneId, fn) {
    const { draft } = get();
    if (draft?.id === sceneId) {
      get().setDraft(fn(draft));
      return;
    }
    const scene = useCampaignStore.getState().current?.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const next = fn(scene);
    const liveId = usePresenterStore.getState().state.scene?.id ?? null;
    if (next.id === liveId) usePresenterStore.getState().syncLiveScene(next);
    void useCampaignStore.getState().saveScene(next);
  },

  patchTokenAnywhere(tokenId, patch) {
    const { draft } = get();
    const scene =
      (draft?.tokens.some((t) => t.id === tokenId) ? draft : undefined) ??
      useCampaignStore
        .getState()
        .current?.scenes.find((s) => s.tokens.some((t) => t.id === tokenId));
    if (!scene) return;
    get().patchScene(scene.id, (s) => ({
      ...s,
      tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, ...patch } : t)),
    }));
  },

  reset() {
    set({ selectedId: null, hoverId: null, draft: null });
  },
}));

// Saved scenes flow back into the draft unless the DM is mid-edit on that very scene.
useCampaignStore.subscribe((s, prev) => {
  if (s.current === prev.current) return;
  const { selectedId, draft } = useSceneStore.getState();
  if (!s.current || (prev.current && s.current.campaign.id !== prev.current.campaign.id)) {
    useSceneStore.getState().reset();
    return;
  }
  const saved = s.current.scenes.find((x) => x.id === selectedId) ?? null;
  if (!saved) {
    if (selectedId) useSceneStore.setState({ selectedId: null, draft: null });
    return;
  }
  if (!draft || saved.updatedAt !== draft.updatedAt) useSceneStore.setState({ draft: saved });
});
