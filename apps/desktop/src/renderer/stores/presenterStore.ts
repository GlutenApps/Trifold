import { create } from 'zustand';
import {
  iconUrl,
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
import { DEFAULT_GRID, cameraRect, mapSize } from '../features/presenter/mapMath';

const HISTORY_LIMIT = 20;
const RECENT_LIMIT = 8;

export interface LiveOptions {
  /** Width / height of the player display; used to frame the player camera. */
  aspect: number;
  activeTokenId: string | null;
  tokenStyle: 'engraved' | 'flat' | 'twoTone' | 'plain';
}

const DEFAULT_OPTIONS: LiveOptions = {
  aspect: 16 / 9,
  activeTokenId: null,
  tokenStyle: 'engraved',
};

/** Turns a stored scene into what the player window renders. Folders don't go live. */
export function liveSceneFrom(
  scene: Scene,
  campaignSlug: string,
  options: LiveOptions = DEFAULT_OPTIONS,
): LiveScene | null {
  switch (scene.kind) {
    case 'map':
    case 'blankGrid': {
      if (scene.kind === 'map' && !scene.image) return null;
      const grid = scene.grid ?? DEFAULT_GRID;
      const size = mapSize(scene);
      return {
        kind: scene.kind,
        id: scene.id,
        title: scene.title,
        ...(scene.image ? { imageUrl: mediaUrl(campaignSlug, scene.image.displayPath) } : {}),
        width: size.width,
        height: size.height,
        backdrop: scene.backdrop ?? (scene.kind === 'blankGrid' ? 'parchment' : 'dark'),
        grid: {
          cellPx: grid.cellPx,
          offsetX: grid.offsetX,
          offsetY: grid.offsetY,
          color: grid.color,
          opacity: grid.opacity,
          visible: grid.showToPlayers,
        },
        tokens: scene.tokens
          .filter((t) => !t.hidden)
          .map((t) => ({
            id: t.id,
            kind: t.kind,
            x: t.x,
            y: t.y,
            footprint: t.footprint,
            label: t.kind === 'creature' && t.nameMasked ? (t.maskedLabel ?? 'Creature') : t.label,
            role: t.role,
            ...(t.art ? { artUrl: mediaUrl(campaignSlug, t.art) } : {}),
            ...(t.glyph ? { glyphUrl: iconUrl(t.glyph) } : {}),
            ...(t.color ? { color: t.color } : {}),
            dead: t.dead,
          })),
        tokenStyle: options.tokenStyle,
        camera: cameraRect(
          scene.playerCamera,
          size,
          grid,
          scene.tokens,
          options.aspect,
          options.activeTokenId,
        ),
      };
    }
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
  /** The stored scene behind the live one, so token moves and camera changes can re-derive it. */
  liveSource: { scene: Scene; campaignSlug: string } | null;
  /** Player display aspect and token style; the shell keeps these current. */
  liveOptions: Pick<LiveOptions, 'aspect' | 'tokenStyle'>;

  showScene(scene: Scene, campaignSlug: string): boolean;
  /**
   * Re-derives the live scene from an edited copy without touching history. Pushes are
   * coalesced to one per animation frame so token drags mirror at the display rate.
   */
  syncLiveScene(scene: Scene): void;
  setLiveOptions(options: Partial<Pick<LiveOptions, 'aspect' | 'tokenStyle'>>): void;
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

function activeTokenOf(combat: CombatSummary | null): string | null {
  if (!combat?.activeId) return null;
  return combat.entries.find((e) => e.id === combat.activeId)?.tokenId ?? null;
}

export const usePresenterStore = create<PresenterStore>((set, get) => {
  const commit = (next: Omit<PresenterState, 'updatedAt'>): void => {
    const state: PresenterState = { ...next, updatedAt: Date.now() };
    set({ state });
    void window.trifold.presenter.push(state);
  };

  let frame: number | null = null;
  const commitCoalesced = (next: Omit<PresenterState, 'updatedAt'>): void => {
    const state: PresenterState = { ...next, updatedAt: Date.now() };
    set({ state });
    if (frame !== null) return;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: () => void) => window.setTimeout(cb, 16);
    frame = raf(() => {
      frame = null;
      void window.trifold.presenter.push(get().state);
    });
  };

  const optionsFor = (combat: CombatSummary | null): LiveOptions => ({
    ...get().liveOptions,
    activeTokenId: activeTokenOf(combat),
  });

  return {
    state: initialPresenterState,
    history: [],
    recent: [],
    liveOverride: null,
    liveSource: null,
    liveOptions: { aspect: DEFAULT_OPTIONS.aspect, tokenStyle: DEFAULT_OPTIONS.tokenStyle },

    showScene(scene, campaignSlug) {
      const live = liveSceneFrom(scene, campaignSlug, optionsFor(get().state.combat));
      if (!live) return false;
      const { state, history, recent, liveOverride } = get();
      set({
        history: [
          ...history.slice(-(HISTORY_LIMIT - 1)),
          { scene: state.scene, override: liveOverride },
        ],
        recent: [scene.id, ...recent.filter((id) => id !== scene.id)].slice(0, RECENT_LIMIT),
        liveOverride: scene.showTitleOverride,
        liveSource: { scene, campaignSlug },
      });
      commit({
        ...state,
        blackout: false,
        scene: live,
        showSceneTitle: scene.showTitleOverride ?? state.overlays.sceneTitle,
      });
      return true;
    },

    syncLiveScene(scene) {
      const { state, liveSource } = get();
      if (!liveSource || !state.scene || state.scene.id !== scene.id) return;
      const live = liveSceneFrom(scene, liveSource.campaignSlug, optionsFor(state.combat));
      if (!live) return;
      set({ liveSource: { ...liveSource, scene } });
      commitCoalesced({ ...state, scene: live });
    },

    setLiveOptions(options) {
      const liveOptions = { ...get().liveOptions, ...options };
      set({ liveOptions });
      const { liveSource, state } = get();
      if (liveSource && state.scene?.id === liveSource.scene.id) {
        const live = liveSceneFrom(
          liveSource.scene,
          liveSource.campaignSlug,
          optionsFor(state.combat),
        );
        if (live) commit({ ...state, scene: live });
      }
    },

    undo() {
      const { history, state } = get();
      const previous = history[history.length - 1];
      if (!previous) return;
      set({ history: history.slice(0, -1), liveOverride: previous.override, liveSource: null });
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
      const { state, liveSource } = get();
      if (JSON.stringify(state.combat) === JSON.stringify(summary)) return;
      // A follow camera moves with the active turn, so re-derive the map when the turn changes.
      const scene =
        liveSource && state.scene?.id === liveSource.scene.id && state.scene.kind !== 'title'
          ? (liveSceneFrom(liveSource.scene, liveSource.campaignSlug, optionsFor(summary)) ??
            state.scene)
          : state.scene;
      commit({ ...state, combat: summary, scene });
    },
  };
});
