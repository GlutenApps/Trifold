import { create } from 'zustand';
import { libraryUrl, type CreatureArt } from '@trifold/api';
import { errorMessage, type RecordKind } from '@trifold/schema';

/**
 * Which compendium creatures have art (ADR 0033), by kind and key, so a token, a compendium page
 * and the Images list can show it without asking main each time. Loaded when a Library opens;
 * every change through here updates it.
 */
const id = (kind: RecordKind, key: string) => `${kind}:${key}`;

interface ArtState {
  byKey: Record<string, CreatureArt>;
  error: string | null;
  load(): Promise<void>;
  /** Asks for a file when none is given; resolves true when art was set. */
  setCreature(kind: RecordKind, key: string, file?: string): Promise<boolean>;
  removeCreature(kind: RecordKind, key: string): Promise<void>;
  clearError(): void;
}

export const useArtStore = create<ArtState>((set, get) => ({
  byKey: {},
  error: null,

  async load() {
    try {
      const all = await window.trifold.art.list();
      set({ byKey: Object.fromEntries(all.map((a) => [id(a.kind, a.key), a])) });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async setCreature(kind, key, file) {
    try {
      const art = await window.trifold.art.setCreature(kind, key, file);
      if (!art) return false;
      set({ byKey: { ...get().byKey, [id(kind, key)]: art }, error: null });
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  async removeCreature(kind, key) {
    try {
      await window.trifold.art.removeCreature(kind, key);
      const { [id(kind, key)]: _gone, ...rest } = get().byKey;
      set({ byKey: rest, error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/** The URL of a creature's art, or undefined when it has none. */
export function creatureArtUrl(kind: RecordKind, key: string): string | undefined {
  const art = useArtStore.getState().byKey[id(kind, key)];
  return art ? libraryUrl(art.path, art.version) : undefined;
}
