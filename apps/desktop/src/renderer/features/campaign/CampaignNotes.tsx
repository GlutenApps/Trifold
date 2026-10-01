import { useState } from 'react';
import type { Note } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { Icon } from '../shell/icons';

function blankNote(): Note {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: '',
    title: '',
    body: '',
    tags: [],
    links: [],
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

function NoteEditor({
  note,
  onSave,
  onCancel,
}: {
  note: Note;
  onSave(note: Note): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(', '));
  const submit = () => {
    if (title.trim()) onSave({ ...note, title: title.trim(), body, tags: parseTags(tags) });
  };
  return (
    <form
      className="card note-editor"
      aria-label={note.id ? `Edit ${note.title}` : 'New note'}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <label className="field">
        Title
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        Body (markdown)
        <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="field">
        Tags (comma-separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <div className="row">
        <button type="submit" className="btn primary" disabled={!title.trim()}>
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <span className="muted small">Ctrl+Enter saves · Esc cancels</span>
      </div>
    </form>
  );
}

/** The campaign's notes: add, edit, reorder and remove (DESIGN.md §6.3). */
export function CampaignNotes({ notes }: { notes: readonly Note[] }) {
  const saveNote = useCampaignStore((s) => s.saveNote);
  const removeNote = useCampaignStore((s) => s.removeNote);
  const moveNote = useCampaignStore((s) => s.moveNote);
  const [editing, setEditing] = useState<Note | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = (note: Note) => {
    void saveNote(note).then((saved) => {
      if (saved) setOpen((prev) => new Set(prev).add(saved.id));
    });
    setEditing(null);
  };

  return (
    <div className="card">
      <div className="row">
        <h2>Notes</h2>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          disabled={editing !== null && !editing.id}
          onClick={() => setEditing(blankNote())}
        >
          New note
        </button>
      </div>
      {notes.length === 0 && !editing && <p className="muted">No notes yet.</p>}
      {notes.map((n, i) =>
        editing?.id === n.id ? (
          <NoteEditor key={n.id} note={editing} onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div key={n.id} className="entity-row" data-testid="note-row">
            <div className="row">
              <button
                type="button"
                className="chrome-btn xs"
                aria-expanded={open.has(n.id)}
                aria-label={`${open.has(n.id) ? 'Collapse' : 'Expand'} ${n.title}`}
                title={open.has(n.id) ? 'Collapse' : 'Expand'}
                onClick={() => toggle(n.id)}
              >
                <Icon name={open.has(n.id) ? 'down' : 'right'} size={13} />
              </button>
              <strong>{n.title}</strong>
              {n.tags.map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
              <span className="spacer" />
              <span className="row-actions">
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Edit ${n.title}`}
                  title="Edit"
                  onClick={() => setEditing(n)}
                >
                  <Icon name="pencil" size={13} />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Move ${n.title} up`}
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => void moveNote(n.id, -1)}
                >
                  <Icon name="up" size={13} />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Move ${n.title} down`}
                  title="Move down"
                  disabled={i === notes.length - 1}
                  onClick={() => void moveNote(n.id, 1)}
                >
                  <Icon name="down" size={13} />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs danger"
                  aria-label={`Remove ${n.title}`}
                  title="Remove"
                  onClick={() => void removeNote(n.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
            {open.has(n.id) &&
              (n.body ? (
                <pre className="source-text">{n.body}</pre>
              ) : (
                <p className="muted">Empty note.</p>
              ))}
          </div>
        ),
      )}
      {editing && !editing.id && (
        <NoteEditor note={editing} onSave={save} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}
