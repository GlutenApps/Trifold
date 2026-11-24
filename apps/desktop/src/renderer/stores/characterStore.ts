import { create } from 'zustand';
import { ulid } from 'ulid';
import { blankSheet, sheetFromNumbers } from '@trifold/rules';
import type { PdfSheetPreview } from '@trifold/api';
import {
  errorMessage,
  nowIso,
  type Character,
  type CharacterBuild,
  type CharacterEdition,
  type Sheet,
} from '@trifold/schema';

/**
 * The player's characters (ADR 0068) as the renderer holds them: the list from main, the one
 * open in an editor, and saves. A change shows at once and is written a moment later, so typing
 * in a sheet is not a file write per key; leaving the editor writes what is pending.
 */

const SAVE_DELAY_MS = 400;
const timers = new Map<string, number>();

interface CharacterState {
  characters: Character[];
  loaded: boolean;
  /** The character open in an editor, by id; null for the list. */
  openId: string | null;
  /** The player console's Sheets tab shows the linked character's editor, not its sheet. */
  editingSheet: boolean;
  setEditingSheet(on: boolean): void;
  error: string | null;
  load(): Promise<void>;
  open(id: string | null): void;
  /** Makes a character and opens it. */
  create(kind: Character['kind'], name: string): Promise<Character | null>;
  /**
   * A new Trifold character being made (docs/BUILDER.md), by the name it was given: in the
   * guided builder, or by Import from PDF (ADR 0073). `forJoined` links the result to the open
   * joined campaign. Null when none is.
   */
  building: {
    name: string;
    forJoined: boolean;
    way: 'guided' | 'pdf';
    /** The rules the guided builder follows (docs/BUILDER.md): 2024, or 2014 from SRD 5.1. */
    edition: CharacterEdition;
  } | null;
  startBuilding(
    name: string,
    forJoined: boolean,
    way?: 'guided' | 'pdf',
    edition?: CharacterEdition,
  ): void;
  cancelBuilding(): void;
  /** The builder's Finish: a Trifold character with the sheet and build record it made. */
  createBuilt(name: string, sheet: Sheet, build: CharacterBuild): Promise<Character | null>;
  /** Import from PDF's Create: a Trifold character with the sheet, rules and notes read. */
  createImported(
    name: string,
    preview: PdfSheetPreview,
    edition: CharacterEdition,
  ): Promise<Character | null>;
  /** Changes a character at once and writes it a moment later. */
  change(id: string, patch: Partial<Character>): void;
  /** Writes a character's pending change now. */
  flush(id: string): Promise<void>;
  /** An External character becomes a Trifold one, its numbers the sheet's start (one way). */
  makeTrifold(id: string): void;
  remove(id: string): Promise<void>;
  exportFile(id: string): Promise<string | null>;
  importFile(): Promise<Character | null>;
  clearError(): void;
}

export const useCharacterStore = create<CharacterState>((set, get) => {
  const write = async (id: string) => {
    timers.delete(id);
    const character = get().characters.find((c) => c.id === id);
    if (!character) return;
    try {
      const saved = await window.trifold.characters.save(character);
      // Keep what was typed since; take the file's updatedAt.
      set((s) => ({
        characters: s.characters.map((c) =>
          c.id === id ? { ...c, updatedAt: saved.updatedAt } : c,
        ),
      }));
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  };

  /** A new Trifold character made with what the builder or Import from PDF gives it. */
  const createWith = async (name: string, patch: Partial<Character>) => {
    const made = await get().create('trifold', name);
    if (!made) return null;
    const next: Character = { ...made, ...patch };
    set((s) => ({
      characters: s.characters.map((c) => (c.id === made.id ? next : c)),
      building: null,
    }));
    try {
      const saved = await window.trifold.characters.save(next);
      set((s) => ({ characters: s.characters.map((c) => (c.id === saved.id ? saved : c)) }));
      return saved;
    } catch (err) {
      set({ error: errorMessage(err) });
      return next;
    }
  };

  return {
    characters: [],
    loaded: false,
    openId: null,
    editingSheet: false,
    building: null,

    startBuilding(name, forJoined, way = 'guided', edition = '2024') {
      set({ building: { name, forJoined, way, edition } });
    },

    cancelBuilding() {
      set({ building: null });
    },

    createBuilt(name, sheet, build) {
      // The character plays under the rules it was built with.
      return createWith(name, { sheet, build, edition: build.edition });
    },

    createImported(name, preview, edition) {
      return createWith(name, { sheet: preview.sheet, edition, notes: preview.notes });
    },
    error: null,

    setEditingSheet(on) {
      set({ editingSheet: on });
    },

    async load() {
      try {
        set({ characters: await window.trifold.characters.list(), loaded: true });
      } catch (err) {
        set({ error: errorMessage(err), loaded: true });
      }
    },

    open(id) {
      const was = get().openId;
      if (was && was !== id) void get().flush(was);
      set({ openId: id });
    },

    async create(kind, name) {
      const at = nowIso();
      const draft: Character = {
        schemaVersion: 1,
        id: ulid(),
        name: name.trim() || 'Unnamed character',
        kind,
        edition: '2024',
        numbers: {
          classText: '',
          level: 1,
          maxHp: 10,
          ac: 10,
          initiativeBonus: 0,
          speed: 30,
          passives: { perception: 10, insight: 10, investigation: 10 },
          saves: {},
        },
        ...(kind === 'trifold' ? { sheet: blankSheet() } : {}),
        notes: '',
        createdAt: at,
        updatedAt: at,
      };
      try {
        const saved = await window.trifold.characters.save(draft);
        set((s) => ({
          characters: [...s.characters, saved].sort((a, b) => a.name.localeCompare(b.name)),
          openId: saved.id,
        }));
        return saved;
      } catch (err) {
        set({ error: errorMessage(err) });
        return null;
      }
    },

    change(id, patch) {
      set((s) => ({
        characters: s.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
      const pending = timers.get(id);
      if (pending) window.clearTimeout(pending);
      timers.set(
        id,
        window.setTimeout(() => void write(id), SAVE_DELAY_MS),
      );
    },

    async flush(id) {
      const pending = timers.get(id);
      if (!pending) return;
      window.clearTimeout(pending);
      await write(id);
    },

    makeTrifold(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character || character.kind === 'trifold') return;
      get().change(id, { kind: 'trifold', sheet: sheetFromNumbers(character.numbers) });
    },

    async remove(id) {
      const pending = timers.get(id);
      if (pending) window.clearTimeout(pending);
      timers.delete(id);
      try {
        await window.trifold.characters.remove(id);
        set((s) => ({
          characters: s.characters.filter((c) => c.id !== id),
          openId: s.openId === id ? null : s.openId,
        }));
      } catch (err) {
        set({ error: errorMessage(err) });
      }
    },

    async exportFile(id) {
      await get().flush(id);
      try {
        return await window.trifold.characters.exportFile(id);
      } catch (err) {
        set({ error: errorMessage(err) });
        return null;
      }
    },

    async importFile() {
      try {
        const character = await window.trifold.characters.importFile();
        if (character) {
          set((s) => ({
            characters: [...s.characters, character].sort((a, b) => a.name.localeCompare(b.name)),
          }));
        }
        return character;
      } catch (err) {
        set({ error: errorMessage(err) });
        return null;
      }
    },

    clearError() {
      set({ error: null });
    },
  };
});
