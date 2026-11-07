import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Note, NoteTemplate } from '@trifold/schema';
import { ancestorsOf, descendantsOf, flattenTree, nextOrder, searchNotes } from '@trifold/rules';
import { useCampaignStore } from '../../stores/campaignStore';
import { cancelSave, scheduleSave } from '../../stores/pendingSaves';
import { blankTemplate, useNoteTemplateStore } from '../../stores/noteTemplateStore';
import { useTreeDnd } from '../../treeDnd';
import { Icon } from '../shell/icons';
import { AUTOSAVE_MS } from './autosave';
import { InlineConfirm } from '../shell/InlineConfirm';
import { NoteEditor, type Highlight } from './NoteEditor';
import { TemplatesPane } from './TemplatesPane';

/**
 * The Notes sub-tab of the Campaign major (ADR 0010): a tree of notes and folders on the left
 * with find, new note, new folder, collapse and drag-to-move, and the open note (or the
 * templates editor) on the right, split by a drag edge. Search is a phrase search in memory;
 * its hits replace the tree, and Enter and Shift+Enter step through every occurrence, which the
 * editor highlights. The open note saves itself shortly after the last change and on close,
 * through the pending-save registry so a backup can flush it first (ADR 0015).
 */
const TREE_MIN = 180;
const TREE_MAX = 520;

const isFolder = (n: Note) => n.kind === 'folder';

function blankNote(
  kind: Note['kind'],
  parentId: string | null,
  order: number,
  template: NoteTemplate | null = null,
): Note {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: '',
    kind,
    title: template ? template.name : kind === 'folder' ? 'New folder' : 'Untitled note',
    body: template ? template.body : '',
    tags: [],
    links: [],
    parentId,
    order,
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

type Editable = Pick<Note, 'title' | 'body' | 'tags'>;

/**
 * A draft of a note's editable fields that saves itself shortly after the last change (and at
 * once on unmount). The save merges the draft onto the note as the store holds it now, so a move
 * that lands while typing is not undone by the next flush.
 */
function useDraft(note: Note) {
  const saveNote = useCampaignStore((s) => s.saveNote);
  const [draft, setDraft] = useState<Editable>({
    title: note.title,
    body: note.body,
    tags: note.tags,
  });
  const [dirty, setDirty] = useState(false);
  const latest = useRef(note);
  latest.current = note;
  const pending = useRef<Editable | null>(null);
  /** This editor's slot in the pending-save registry. */
  const timer = useRef({});

  const flush = useCallback(() => {
    cancelSave(timer);
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setDirty(false);
    return saveNote({
      ...latest.current,
      ...patch,
      title: patch.title.trim() || latest.current.title,
    });
  }, [saveNote]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  const update = (patch: Partial<Editable>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      pending.current = next;
      return next;
    });
    setDirty(true);
    scheduleSave(timer, flush, AUTOSAVE_MS);
  };

  return { draft, update, dirty, flush };
}

function BackButton({ onBack }: { onBack(): void }) {
  return (
    <button
      type="button"
      className="chrome-btn notes-back"
      aria-label="Back to notes"
      title="Back to notes"
      onClick={onBack}
    >
      <Icon name="left" />
    </button>
  );
}

function NotePane({
  note,
  highlight,
  onBack,
}: {
  note: Note;
  highlight: Highlight | null;
  onBack(): void;
}) {
  const removeNote = useCampaignStore((s) => s.removeNote);
  const { draft, update, dirty, flush } = useDraft(note);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagText, setTagText] = useState(draft.tags.join(', '));
  const titleRef = useRef<HTMLInputElement>(null);
  const fresh = Date.now() - Date.parse(note.createdAt) < 5000;

  // A note made a moment ago has a placeholder title: select it so typing replaces it.
  useEffect(() => {
    if (fresh) titleRef.current?.select();
  }, [fresh]);

  return (
    <div className="notes-pane" data-testid="note-pane">
      <div className="row note-head">
        <BackButton onBack={onBack} />
        <input
          ref={titleRef}
          className="note-title"
          aria-label="Title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          onBlur={flush}
        />
        <span className="muted small note-status" aria-live="polite">
          {dirty ? 'Unsaved' : 'Saved'}
        </span>
        {confirmDelete ? (
          <InlineConfirm
            name={note.title}
            onConfirm={() => void removeNote(note.id)}
            onKeep={() => setConfirmDelete(false)}
          />
        ) : (
          <button
            type="button"
            className="chrome-btn danger"
            aria-label={`Delete ${note.title}`}
            title="Delete note"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="row note-meta">
        <label className="field inline grow">
          Tags
          <input
            aria-label="Tags (comma-separated)"
            placeholder="comma-separated"
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value);
              update({ tags: parseTags(e.target.value) });
            }}
            onBlur={flush}
          />
        </label>
      </div>
      <NoteEditor
        markdown={note.body}
        onChange={(markdown) => update({ body: markdown })}
        highlight={highlight}
      />
    </div>
  );
}

function FolderPane({
  folder,
  notes,
  onBack,
}: {
  folder: Note;
  notes: readonly Note[];
  onBack(): void;
}) {
  const removeNote = useCampaignStore((s) => s.removeNote);
  const { draft, update, dirty, flush } = useDraft(folder);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contents = descendantsOf(notes, folder.id);
  const noteCount = contents.filter((n) => !isFolder(n)).length;
  const folderCount = contents.length - noteCount;
  const summary = [
    noteCount ? `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : '',
    folderCount ? `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="notes-pane" data-testid="folder-pane">
      <div className="row note-head">
        <BackButton onBack={onBack} />
        <Icon name="folder" />
        <input
          className="note-title"
          aria-label="Folder name"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          onBlur={flush}
        />
        <span className="muted small note-status" aria-live="polite">
          {dirty ? 'Unsaved' : 'Saved'}
        </span>
      </div>
      <p className="muted small">
        {summary || 'Empty folder'}. Drag notes onto the folder to put them inside.
      </p>
      <div className="row">
        {contents.length === 0 ? (
          <button
            type="button"
            className="btn small"
            onClick={() => void removeNote(folder.id, 'lift')}
          >
            Remove folder
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn small"
              onClick={() => void removeNote(folder.id, 'lift')}
            >
              Remove folder, keep contents
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => void removeNote(folder.id, 'delete')}
                >
                  Delete {summary} for good
                </button>
                <button type="button" className="btn small" onClick={() => setConfirmDelete(false)}>
                  Keep them
                </button>
              </>
            ) : (
              <button type="button" className="btn small" onClick={() => setConfirmDelete(true)}>
                Remove folder and contents…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The toolbar's template button: pick one for a new note, keep a note as one, or manage them. */
function TemplateMenu({
  templates,
  canSaveNote,
  onPick,
  onSaveNote,
  onManage,
}: {
  templates: readonly NoteTemplate[];
  canSaveNote: boolean;
  onPick(template: NoteTemplate): void;
  onSaveNote(): void;
  onManage(): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const item = (label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {label}
    </button>
  );

  return (
    <span
      className="menu-anchor"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="chrome-btn"
        aria-label="New note from template"
        title="New note from template"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="template" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Templates">
          {templates.length === 0 && (
            <span className="menu-note muted small">No templates yet.</span>
          )}
          {templates.map((t) => (
            <span key={t.id}>{item(t.name, () => onPick(t))}</span>
          ))}
          <div className="menu-sep" />
          {canSaveNote && item('Save open note as template', onSaveNote)}
          {item('Manage templates…', onManage)}
        </div>
      )}
    </span>
  );
}

interface Hit {
  noteId: string;
  /** Occurrence in the body, from 0; title-only hits use 0 with nothing to highlight. */
  occurrence: number;
}

/**
 * The campaign's notes as a tree of folders beside the open note (DESIGN.md §6.3, ADR 0010).
 * The tree works like the scene tree: click selects, folders collapse, rows drag to reorder or
 * to move into a folder. Typing in "Find in notes" swaps the tree for phrase hits with context;
 * a snippet opens its note at that line. The open note saves itself as it is edited.
 */
export function CampaignNotes({ notes }: { notes: readonly Note[] }) {
  const saveNote = useCampaignStore((s) => s.saveNote);
  const moveNote = useCampaignStore((s) => s.moveNote);
  const templates = useNoteTemplateStore((s) => s.templates);
  const loadTemplates = useNoteTemplateStore((s) => s.load);
  const saveTemplate = useNoteTemplateStore((s) => s.save);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [hit, setHit] = useState<Hit | null>(null);
  const [treeWidth, setTreeWidth] = useState(260);
  /** The right pane shows the selected note, or the templates when the DM is managing them. */
  const [managing, setManaging] = useState<{ templateId: string | null } | null>(null);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const phrase = query.trim();
  const hits = useMemo(
    () =>
      searchNotes(
        notes.filter((n) => !isFolder(n)),
        phrase,
      ),
    [notes, phrase],
  );
  /** Every place a search can land, in reading order, for next and previous. */
  const landings = useMemo<Hit[]>(
    () =>
      hits.flatMap((h) =>
        h.count
          ? Array.from({ length: h.count }, (_, occurrence) => ({ noteId: h.noteId, occurrence }))
          : [{ noteId: h.noteId, occurrence: 0 }],
      ),
    [hits],
  );
  const landingIndex = hit
    ? landings.findIndex((l) => l.noteId === hit.noteId && l.occurrence === hit.occurrence)
    : -1;
  const rows = flattenTree(notes, isFolder, collapsed);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** A note found by search or dropped into a collapsed folder opens its ancestors. */
  const expandTo = (note: Note) =>
    setCollapsed((prev) => {
      const open = ancestorsOf(notes, note).filter((a) => prev.has(a.id));
      if (!open.length) return prev;
      const next = new Set(prev);
      for (const a of open) next.delete(a.id);
      return next;
    });

  const select = (note: Note) => {
    setSelectedId(note.id);
    expandTo(note);
  };

  const land = (target: Hit) => {
    const note = notes.find((n) => n.id === target.noteId);
    if (!note) return;
    setHit(target);
    select(note);
  };

  const step = (direction: 1 | -1) => {
    if (!landings.length) return;
    const next =
      landingIndex === -1
        ? direction > 0
          ? 0
          : landings.length - 1
        : (landingIndex + direction + landings.length) % landings.length;
    land(landings[next]!);
  };

  /** A new note or folder next to the selection (inside it when a folder is selected). */
  const create = async (kind: Note['kind'], template: NoteTemplate | null = null) => {
    const parentId = selected && isFolder(selected) ? selected.id : (selected?.parentId ?? null);
    const saved = await saveNote(blankNote(kind, parentId, nextOrder(notes, parentId), template));
    if (saved) {
      setQuery('');
      setHit(null);
      setManaging(null);
      select({ ...saved, parentId });
    }
  };

  /** Keeps the open note's body as a template, then opens it for a rename. */
  const saveSelectedAsTemplate = async () => {
    if (!selected || isFolder(selected)) return;
    const saved = await saveTemplate(blankTemplate(selected.title, selected.body));
    if (saved) setManaging({ templateId: saved.id });
  };

  const dnd = useTreeDnd<Note>({
    items: notes,
    isFolder,
    onMove: (id, parentId, index) => {
      if (parentId)
        setCollapsed((prev) =>
          prev.has(parentId) ? new Set([...prev].filter((p) => p !== parentId)) : prev,
        );
      void moveNote(id, parentId, index);
    },
  });

  const dragEdge = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    const left = target.parentElement?.getBoundingClientRect().left ?? 0;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) =>
      setTreeWidth(Math.min(TREE_MAX, Math.max(TREE_MIN, ev.clientX - left)));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const highlight: Highlight | null =
    phrase && selected
      ? { phrase, active: hit?.noteId === selected.id ? hit.occurrence : 0 }
      : null;
  const back = () => {
    setSelectedId(null);
    setManaging(null);
  };

  return (
    <div
      className={`notes-view${selected || managing ? ' has-selection' : ''}`}
      style={{ '--notes-tree': `${treeWidth}px` } as CSSProperties}
    >
      <div className="notes-tree-pane">
        <div className="row notes-toolbar">
          <input
            type="search"
            aria-label="Find in notes"
            placeholder="Find in notes"
            className="grow"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHit(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              } else if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
                setHit(null);
              }
            }}
          />
          {phrase ? (
            <span className="icon-toolbar" role="group" aria-label="Matches">
              <span className="muted small match-count" aria-live="polite">
                {landings.length
                  ? `${landingIndex === -1 ? '–' : landingIndex + 1} of ${landings.length}`
                  : 'No matches'}
              </span>
              <button
                type="button"
                className="chrome-btn"
                aria-label="Previous match"
                title="Previous match (Shift+Enter)"
                disabled={!landings.length}
                onClick={() => step(-1)}
              >
                <Icon name="up" />
              </button>
              <button
                type="button"
                className="chrome-btn"
                aria-label="Next match"
                title="Next match (Enter)"
                disabled={!landings.length}
                onClick={() => step(1)}
              >
                <Icon name="down" />
              </button>
            </span>
          ) : (
            <span className="icon-toolbar" role="group" aria-label="Add">
              <button
                type="button"
                className="chrome-btn primary"
                aria-label="New note"
                title="New note"
                onClick={() => void create('note')}
              >
                <Icon name="plus" />
              </button>
              <button
                type="button"
                className="chrome-btn"
                aria-label="New notes folder"
                title="New folder"
                onClick={() => void create('folder')}
              >
                <Icon name="folder" />
              </button>
              <TemplateMenu
                templates={templates}
                canSaveNote={selected !== null && !isFolder(selected)}
                onPick={(t) => void create('note', t)}
                onSaveNote={() => void saveSelectedAsTemplate()}
                onManage={() => setManaging({ templateId: null })}
              />
            </span>
          )}
        </div>

        {phrase ? (
          <div className="notes-tree notes-results" role="list" aria-label="Search results">
            {hits.length === 0 && <p className="muted">Nothing contains “{phrase}”.</p>}
            {hits.map((h) => {
              const note = notes.find((n) => n.id === h.noteId)!;
              const path = ancestorsOf(notes, note)
                .map((a) => a.title)
                .join(' / ');
              return (
                <div
                  key={h.noteId}
                  role="listitem"
                  className={`result${note.id === selectedId ? ' selected' : ''}`}
                  data-testid="note-result"
                >
                  <button
                    type="button"
                    className="result-title"
                    aria-label={`Open ${note.title}`}
                    onClick={() => land({ noteId: h.noteId, occurrence: 0 })}
                  >
                    <Icon name="card" size={14} />
                    <span className="tree-name">{note.title}</span>
                    {h.count > 0 && <span className="badge">{h.count}</span>}
                  </button>
                  {path && <span className="muted small result-path">{path}</span>}
                  {h.snippets.map((s) => (
                    <button
                      key={s.occurrence}
                      type="button"
                      className={`result-snippet${
                        hit?.noteId === h.noteId && hit.occurrence === s.occurrence ? ' active' : ''
                      }`}
                      aria-label={`Open ${note.title} at match ${s.occurrence + 1}`}
                      onClick={() => land({ noteId: h.noteId, occurrence: s.occurrence })}
                    >
                      {s.before}
                      <mark>{s.match}</mark>
                      {s.after}
                    </button>
                  ))}
                  {h.count > h.snippets.length && (
                    <span className="muted small result-more">
                      +{h.count - h.snippets.length} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={`notes-tree${dnd.containerClass}`}
            role="tree"
            aria-label="Notes"
            {...dnd.containerProps}
          >
            {rows.length === 0 && <p className="muted">No notes yet.</p>}
            {rows.map(({ item: note, depth }) => {
              const folder = isFolder(note);
              const isSelected = note.id === selectedId;
              const open = folder && !collapsed.has(note.id);
              return (
                <div
                  key={note.id}
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-expanded={folder ? open : undefined}
                  aria-label={note.title}
                  tabIndex={0}
                  className={`tree-row kind-${note.kind}${isSelected ? ' selected' : ''}${dnd.rowClass(note)}`}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  data-testid="note-row"
                  onClick={() => select(note)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') select(note);
                    else if (folder && e.key === 'ArrowLeft' && open) toggleCollapsed(note.id);
                    else if (folder && e.key === 'ArrowRight' && !open) toggleCollapsed(note.id);
                  }}
                  {...dnd.rowProps(note)}
                >
                  <span className="tree-title">
                    {folder ? (
                      <button
                        type="button"
                        className="chrome-btn xs tree-toggle"
                        aria-label={`${open ? 'Collapse' : 'Expand'} ${note.title}`}
                        title={open ? 'Collapse' : 'Expand'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapsed(note.id);
                        }}
                      >
                        <Icon name={open ? 'down' : 'right'} />
                      </button>
                    ) : (
                      <span className="tree-slot" aria-hidden="true">
                        <Icon name="card" size={14} />
                      </span>
                    )}
                    <span className="tree-name">{note.title}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        className="notes-edge"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes tree"
        onPointerDown={dragEdge}
      />
      {managing ? (
        <TemplatesPane initialId={managing.templateId} onDone={() => setManaging(null)} />
      ) : selected ? (
        isFolder(selected) ? (
          <FolderPane key={selected.id} folder={selected} notes={notes} onBack={back} />
        ) : (
          <NotePane key={selected.id} note={selected} highlight={highlight} onBack={back} />
        )
      ) : (
        <div className="notes-pane notes-empty">
          <p className="muted">
            {notes.length ? 'Pick a note to read or edit it.' : 'Add a note or a folder to begin.'}
          </p>
        </div>
      )}
    </div>
  );
}
