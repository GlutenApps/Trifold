import { descendantsOf, type TreeItem } from './tree';

/**
 * Quick notes (ADR 0018) are ordinary notes that live in the campaign's Quick Notes folder.
 * Membership is by place: a note is a quick note while it sits in that folder or a folder
 * inside it, and stops being one when it moves out. The folder is found by its `role`, never
 * by its title, so the DM can rename it.
 */
export interface QuickNoteLike extends TreeItem {
  kind?: 'note' | 'folder';
  title: string;
  role?: 'quickNotes';
  capture?: { at: string };
}

export const QUICK_NOTES_TITLE = 'Quick Notes';

/** The Quick Notes folder, or null when there is none yet (or the DM deleted it). */
export function quickNotesFolder<T extends QuickNoteLike>(notes: readonly T[]): T | null {
  return notes.find((n) => n.kind === 'folder' && n.role === 'quickNotes') ?? null;
}

/** The notes (not folders) inside the Quick Notes folder at any depth, newest first. */
export function quickNotesIn<T extends QuickNoteLike>(notes: readonly T[]): T[] {
  const folder = quickNotesFolder(notes);
  if (!folder) return [];
  return descendantsOf(notes, folder.id)
    .filter((n) => n.kind !== 'folder')
    .sort((a, b) => capturedAt(b).localeCompare(capturedAt(a)));
}

/** When a note was captured, or created when it was not taken with Quick notes. */
export function capturedAt(note: Pick<QuickNoteLike, 'capture' | 'createdAt'>): string {
  return note.capture?.at ?? note.createdAt;
}

/** A capture's title as saved: trimmed, inner whitespace collapsed. Empty means "not ready". */
export function quickNoteTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
