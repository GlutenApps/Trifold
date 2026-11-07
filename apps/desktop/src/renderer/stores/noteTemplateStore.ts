import { create } from 'zustand';
import { errorMessage, type NoteTemplate } from '@trifold/schema';

/** Note templates are Library-wide (ADR 0010); loaded once the notes panel first needs them. */
interface NoteTemplateState {
  templates: NoteTemplate[];
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;
  save(template: NoteTemplate): Promise<NoteTemplate | null>;
  remove(templateId: string): Promise<void>;
  clearError(): void;
}

export function blankTemplate(name = 'New template', body = ''): NoteTemplate {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: '', name, body, createdAt: now, updatedAt: now };
}

export const useNoteTemplateStore = create<NoteTemplateState>((set, get) => ({
  templates: [],
  loaded: false,
  error: null,

  async load() {
    try {
      set({ templates: await window.trifold.noteTemplates.list(), loaded: true, error: null });
    } catch (err) {
      set({ error: errorMessage(err), loaded: true });
    }
  },

  async save(template) {
    try {
      const saved = await window.trifold.noteTemplates.save(template);
      const others = get().templates.filter((t) => t.id !== saved.id);
      const i = get().templates.findIndex((t) => t.id === saved.id);
      const templates = [...others];
      templates.splice(i === -1 ? templates.length : i, 0, saved);
      set({ templates, error: null });
      return saved;
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  async remove(templateId) {
    try {
      await window.trifold.noteTemplates.remove(templateId);
      set({ templates: get().templates.filter((t) => t.id !== templateId), error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
