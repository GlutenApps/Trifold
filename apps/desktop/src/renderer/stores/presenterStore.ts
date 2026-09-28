import { create } from 'zustand';
import {
  initialPresenterState,
  mediaUrl,
  type BreakScreen,
  type CombatSummary,
  type Handout,
  type LiveScene,
  type PresenterOverlays,
  type PresenterState,
} from '@trifold/api';
import type { Scene } from '@trifold/schema';

const HISTORY_LIMIT = 20;
const RECENT_LIMIT = 8;

/** Turns a stored scene into what the player window renders. Folders and (for now) maps don't go live. */
export function liveSceneFrom(scene: Scene, campaignSlug: string): LiveScene | null {
  switch (scene.kind) {
    case 'title':
      return {
        kind: 'title',
        id: scene.id,
        title: scene.title,
        ...(scene.subtitle ? { subtitle: scene.subtitle } : {}),
        ...(scene.backdrop ? { backdrop: scene.backdrop } : {}),
      };
    case 'image':
      if (!scene.image) return null;
      return {
        kind: 'image',
        id: scene.id,
        title: scene.title,
        imageUrl: mediaUrl(campaignSlug, scene.image.displayPath),
        width: scene.image.width,
        height: scene.image.height,
      };
    default:
      return null;
  }
}

interface PresenterStore {
  /** Authoritative presenter state (DESIGN.md §4.1). Every change is pushed to main. */
  state: PresenterState;
  /** Previous live scenes for the undo-last-scene hotkey. */
  history: Array<{ scene: LiveScene | null; override: boolean | null }>;
  /** Scene ids most recently sent to the TV, newest first. */
  recent: string[];
  /** The live scene's per-scene title override, so the global toggle can be re-applied. */
  liveOverride: boolean | null;

  showScene(scene: Scene, campaignSlug: string): boolean;
  undo(): void;
  setBlackout(on: boolean): void;
  toggleBlackout(): void;
  setOverlay<K extends keyof PresenterOverlays>(key: K, value: boolean): void;
  showHandout(handout: Handout): void;
  clearHandout(): void;
  showBreak(title: string, subtitle?: string, minutes?: number): void;
  clearBreak(): void;
  setCombat(summary: CombatSummary | null): void;
}

export const usePresenterStore = create<PresenterStore>((set, get) => {
  const commit = (next: Omit<PresenterState, 'updatedAt'>): void => {
    const state: PresenterState = { ...next, updatedAt: Date.now() };
    set({ state });
    void window.trifold.presenter.push(state);
  };

  return {
    state: initialPresenterState,
    history: [],
    recent: [],
    liveOverride: null,

    showScene(scene, campaignSlug) {
      const live = liveSceneFrom(scene, campaignSlug);
      if (!live) return false;
      const { state, history, recent, liveOverride } = get();
      set({
        history: [
          ...history.slice(-(HISTORY_LIMIT - 1)),
          { scene: state.scene, override: liveOverride },
        ],
        recent: [scene.id, ...recent.filter((id) => id !== scene.id)].slice(0, RECENT_LIMIT),
        liveOverride: scene.showTitleOverride,
      });
      commit({
        ...state,
        blackout: false,
        scene: live,
        showSceneTitle: scene.showTitleOverride ?? state.overlays.sceneTitle,
      });
      return true;
    },

    undo() {
      const { history, state } = get();
      const previous = history[history.length - 1];
      if (!previous) return;
      set({ history: history.slice(0, -1), liveOverride: previous.override });
      commit({
        ...state,
        scene: previous.scene,
        blackout: previous.scene === null,
        showSceneTitle: previous.override ?? state.overlays.sceneTitle,
      });
    },

    setBlackout(on) {
      commit({ ...get().state, blackout: on });
    },

    toggleBlackout() {
      get().setBlackout(!get().state.blackout);
    },

    setOverlay(key, value) {
      const { state, liveOverride } = get();
      const overlays = { ...state.overlays, [key]: value };
      commit({
        ...state,
        overlays,
        showSceneTitle: key === 'sceneTitle' ? (liveOverride ?? value) : state.showSceneTitle,
      });
    },

    showHandout(handout) {
      commit({ ...get().state, handout, blackout: false });
    },

    clearHandout() {
      commit({ ...get().state, handout: null });
    },

    showBreak(title, subtitle, minutes) {
      const breakScreen: BreakScreen = {
        title,
        ...(subtitle ? { subtitle } : {}),
        ...(minutes && minutes > 0 ? { endsAt: Date.now() + minutes * 60_000 } : {}),
      };
      commit({ ...get().state, breakScreen, blackout: false });
    },

    clearBreak() {
      commit({ ...get().state, breakScreen: null });
    },

    setCombat(summary) {
      const current = get().state.combat;
      if (JSON.stringify(current) === JSON.stringify(summary)) return;
      commit({ ...get().state, combat: summary });
    },
  };
});
