import { useMemo } from 'react';
import type { Note } from '@trifold/schema';
import { quickNotesIn } from '@trifold/rules';
import { useCampaignStore } from '../../stores/campaignStore';
import { useJoinedStore } from '../../stores/joinedStore';

/**
 * Where the note editor and Quick notes read and write (docs/PLAYER-MODE.md, "Panels"). In the
 * GM's console that is the open campaign's notes tree, through the campaign store. In a player
 * console it is the player's own notes in the joined campaign (`joined/<id>/notes/`): a flat
 * list with no folders and no Notes panel, which never goes to the GM's table.
 */
export interface NotesSource {
  /** Whose notes these are; a draft belongs to it. Null when no campaign is open. */
  ownerId: string | null;
  /** Every note and folder, for the places a note can move to. */
  notes: readonly Note[];
  /** The quick notes, newest first. */
  quick: readonly Note[];
  /** There are folders to move a note into and a Notes panel to open it in. */
  tree: boolean;
  capture(title: string, body: string): Promise<Note | null>;
  save(note: Note): Promise<Note | null>;
  remove(id: string): Promise<void>;
}

const NO_NOTES: readonly Note[] = [];

// The player's notes go through the joined store; one set of functions, so a draft's save keeps
// its identity from one render to the next.
const joined = useJoinedStore.getState;
const joinedActions: Pick<NotesSource, 'capture' | 'save' | 'remove'> = {
  capture: (title, body) => joined().captureNote(title, body),
  save: (note) => joined().saveNote(note),
  remove: (id) => joined().removeNote(id),
};

export function useNotesSource(): NotesSource {
  const campaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  const campaignNotes = useCampaignStore((s) => s.current?.notes ?? NO_NOTES);
  const captureNote = useCampaignStore((s) => s.captureNote);
  const saveNote = useCampaignStore((s) => s.saveNote);
  const removeNote = useCampaignStore((s) => s.removeNote);
  const joinedId = useJoinedStore((s) => s.current?.campaignId ?? null);
  const joinedNotes = useJoinedStore((s) => s.notes);

  return useMemo<NotesSource>(() => {
    if (joinedId && !campaignId) {
      return {
        ownerId: joinedId,
        notes: joinedNotes,
        quick: joinedNotes,
        tree: false,
        ...joinedActions,
      };
    }
    return {
      ownerId: campaignId,
      notes: campaignNotes,
      quick: quickNotesIn(campaignNotes),
      tree: true,
      capture: captureNote,
      save: saveNote,
      remove: (id) => removeNote(id),
    };
  }, [campaignId, campaignNotes, captureNote, saveNote, removeNote, joinedId, joinedNotes]);
}
