import type { CombatantTemplate } from '@trifold/schema';

/**
 * The encounter builder holds its own copy of the encounter it shows and autosaves it, so an
 * edit made to the stored encounter behind its back would be overwritten by the next autosave.
 * While the builder shows an encounter it registers here; Save to compendium and Replace
 * references (DESIGN.md §6.2) edit its rows through it instead of saving the stored encounter.
 */
export interface BuilderDraft {
  encounterId: string;
  editTemplates(edit: (templates: CombatantTemplate[]) => CombatantTemplate[]): void;
}

let open: BuilderDraft | null = null;

/** Called by the builder when it opens an encounter, and with null when it closes. */
export function registerBuilderDraft(draft: BuilderDraft | null): void {
  open = draft;
}

/** The builder's copy of this encounter, when the builder is showing it. */
export function builderDraftFor(encounterId: string): BuilderDraft | null {
  return open?.encounterId === encounterId ? open : null;
}
