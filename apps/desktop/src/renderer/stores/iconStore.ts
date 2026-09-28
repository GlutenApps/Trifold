import { create } from 'zustand';
import { glyphForCreature, type IconTableSet } from '@trifold/rules';

const EMPTY: IconTableSet = {
  creatureType: {},
  ancestry: {},
  nameKeywords: {},
  synonyms: {},
  itemType: {},
  spellSchool: {},
};

/** The marker token's glyph, when the set has it. */
const MARKER_GLYPH = 'position-marker';

interface IconState {
  tables: IconTableSet;
  available: Set<string>;
  loaded: boolean;
  load(): Promise<void>;
  /**
   * The glyph name for a creature (or 'marker'), or null when the tables have no match or the
   * icon set lacks the name. Misses are reported once per name so the tables can grow.
   */
  glyphForCreature(
    creature: { name: string; type?: string | null; ancestry?: string | null },
    kind: 'creature' | 'marker',
  ): string | null;
}

let loading: Promise<void> | null = null;

export const useIconStore = create<IconState>((set, get) => ({
  tables: EMPTY,
  available: new Set(),
  loaded: false,

  async load() {
    if (get().loaded) return;
    if (!loading) {
      loading = Promise.all([window.trifold.icons.tables(), window.trifold.icons.available()])
        .then(([tables, available]) => set({ tables, available: new Set(available), loaded: true }))
        .catch(() => set({ loaded: true }))
        .finally(() => {
          loading = null;
        });
    }
    await loading;
  },

  glyphForCreature(creature, kind) {
    const { tables, available } = get();
    if (kind === 'marker') return available.has(MARKER_GLYPH) ? MARKER_GLYPH : null;
    const match = glyphForCreature(creature, tables);
    if (match && available.has(match.icon)) return match.icon;
    if (available.size > 0) {
      void window.trifold.icons.reportMiss(
        match ? `creature (icon ${match.icon} missing)` : 'creature',
        creature.name,
      );
    }
    return null;
  },
}));
