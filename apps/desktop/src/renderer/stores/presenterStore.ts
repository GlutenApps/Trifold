import { ulid } from 'ulid';
import { create } from 'zustand';
import { initialPresenterState, type PresenterOverlays, type PresenterState } from '@trifold/api';

const HISTORY_LIMIT = 20;

interface PresenterStore {
  /** Authoritative presenter state (DESIGN.md §4.1). Every change is pushed to main. */
  state: PresenterState;
  /** Previous scene states for the undo-last-scene hotkey. */
  history: PresenterState[];

  setBlackout(on: boolean): void;
  toggleBlackout(): void;
  showTitleCard(title: string, subtitle?: string): void;
  setOverlay<K extends keyof PresenterOverlays>(key: K, value: boolean): void;
  undo(): void;
}

export const usePresenterStore = create<PresenterStore>((set, get) => {
  const commit = (next: Omit<PresenterState, 'updatedAt'>, remember: boolean): void => {
    const previous = get().state;
    const state: PresenterState = { ...next, updatedAt: Date.now() };
    set({
      state,
      history: remember ? [...get().history.slice(-(HISTORY_LIMIT - 1)), previous] : get().history,
    });
    void window.trifold.presenter.push(state);
  };

  return {
    state: initialPresenterState,
    history: [],

    setBlackout(on) {
      commit({ ...get().state, blackout: on }, false);
    },

    toggleBlackout() {
      get().setBlackout(!get().state.blackout);
    },

    showTitleCard(title, subtitle) {
      commit(
        {
          ...get().state,
          blackout: false,
          scene: { kind: 'title', id: ulid(), title, ...(subtitle ? { subtitle } : {}) },
        },
        true,
      );
    },

    setOverlay(key, value) {
      commit({ ...get().state, overlays: { ...get().state.overlays, [key]: value } }, false);
    },

    undo() {
      const history = get().history;
      const previous = history[history.length - 1];
      if (!previous) return;
      set({ history: history.slice(0, -1) });
      commit(previous, false);
    },
  };
});
