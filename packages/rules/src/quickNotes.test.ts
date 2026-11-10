import { describe, expect, it } from 'vitest';
import { capturedAt, quickNotesFolder, quickNotesIn, quickNoteTitle } from './quickNotes';

const note = (
  id: string,
  parentId: string | null,
  extra: Partial<{ kind: 'note' | 'folder'; role: 'quickNotes'; at: string }> = {},
) => ({
  id,
  kind: extra.kind ?? ('note' as const),
  title: id,
  parentId,
  order: 0,
  ...(extra.role ? { role: extra.role } : {}),
  ...(extra.at ? { capture: { at: extra.at } } : {}),
  createdAt: '2026-11-01T00:00:00.000Z',
});

describe('quick notes', () => {
  const notes = [
    note('qn', null, { kind: 'folder', role: 'quickNotes' }),
    note('a', 'qn', { at: '2026-11-09T10:00:00.000Z' }),
    note('b', 'qn', { at: '2026-11-09T11:00:00.000Z' }),
    note('sub', 'qn', { kind: 'folder' }),
    note('c', 'sub', { at: '2026-11-09T09:00:00.000Z' }),
    // Captured once, then moved out: no longer a quick note.
    note('d', null, { at: '2026-11-09T12:00:00.000Z' }),
    // A folder titled like it, without the role, is just a folder.
    { ...note('fake', null, { kind: 'folder' }), title: 'Quick Notes' },
    note('e', 'fake'),
  ];

  it('finds the folder by role, not by title', () => {
    expect(quickNotesFolder(notes)?.id).toBe('qn');
    expect(quickNotesFolder(notes.filter((n) => n.id !== 'qn'))).toBeNull();
  });

  it('lists notes inside the folder at any depth, newest first', () => {
    expect(quickNotesIn(notes).map((n) => n.id)).toEqual(['b', 'a', 'c']);
    expect(quickNotesIn([])).toEqual([]);
  });

  it('falls back to creation time and tidies titles', () => {
    expect(capturedAt(note('x', null))).toBe('2026-11-01T00:00:00.000Z');
    expect(quickNoteTitle('  Bribe   the\nguard ')).toBe('Bribe the guard');
    expect(quickNoteTitle(' \n ')).toBe('');
  });
});
