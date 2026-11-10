import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Note } from '@trifold/schema';
import {
  ancestorsOf,
  capturedAt,
  descendantsOf,
  foldName,
  quickNotesFolder,
  quickNotesIn,
  quickNoteTitle,
} from '@trifold/rules';
import { registerHotkey } from '../../hotkeys';
import { navigate } from '../../navigate';
import { hk } from '../../platform';
import { useCampaignStore } from '../../stores/campaignStore';
import { useQuickNotesStore } from '../../stores/quickNotesStore';
import { Icon } from '../shell/icons';
import { NotePane } from './CampaignNotes';
import { NoteEditor } from './NoteEditor';

/**
 * The Quick notes dock tool (ADR 0018): a capture form on top (a required title, the formatted
 * body, Save), then every quick note, newest first, with a find field. A quick note is an
 * ordinary note in the Quick Notes folder; opening one shows the same pane the notes panel
 * uses (rename, tags, formatting, delete) plus Move to and Open in Notes. Moving a note out of
 * the folder makes it an ordinary note, and it leaves this list.
 */
const NO_NOTES: readonly Note[] = [];

function timeLabel(iso: string): string {
  const at = new Date(iso);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function QuickNotesTool() {
  const campaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  const notes = useCampaignStore((s) => s.current?.notes ?? NO_NOTES);
  const [openId, setOpenId] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const pendingFocus = useQuickNotesStore((s) => s.pendingFocus);

  const quick = useMemo(() => quickNotesIn(notes), [notes]);
  const shown = useMemo(() => {
    const q = foldName(find);
    return q ? quick.filter((n) => foldName(n.title).includes(q)) : quick;
  }, [quick, find]);
  // A note that moved out of the folder, or was deleted, closes here.
  const open = quick.find((n) => n.id === openId) ?? null;

  // Ctrl+N while a note is open goes back to the capture form.
  useEffect(() => {
    if (pendingFocus) setOpenId(null);
  }, [pendingFocus]);

  if (!campaignId) return <p className="muted">Open a campaign first.</p>;

  if (open) {
    return (
      <div className="quick-notes">
        <NotePane
          key={open.id}
          note={open}
          highlight={null}
          backLabel="Back to quick notes"
          onBack={() => setOpenId(null)}
          actions={<NoteActions note={open} notes={notes} />}
        />
      </div>
    );
  }

  return (
    <div className="quick-notes">
      {/* A draft belongs to its campaign: switching campaigns starts a fresh form. */}
      <CaptureForm key={campaignId} />
      <div className="quick-list-head row">
        <input
          type="search"
          aria-label="Find in quick notes"
          placeholder="Find in quick notes"
          className="grow"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
      </div>
      <div className="quick-list" role="list" aria-label="Quick notes">
        {quick.length === 0 && <p className="muted small">Notes you capture here appear here.</p>}
        {quick.length > 0 && shown.length === 0 && (
          <p className="muted small">No quick note is titled “{find.trim()}”.</p>
        )}
        {shown.map((n) => (
          <button
            key={n.id}
            type="button"
            role="listitem"
            className="quick-row"
            data-testid="quick-note-row"
            onClick={() => setOpenId(n.id)}
          >
            <Icon name="card" size={14} />
            <span className="quick-title">{n.title}</span>
            <span className="muted small quick-time">{timeLabel(capturedAt(n))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Title, body and Save. Save stays off until there is a title; Escape drops the draft. */
function CaptureForm() {
  const captureNote = useCampaignStore((s) => s.captureNote);
  const pendingFocus = useQuickNotesStore((s) => s.pendingFocus);
  const focusTaken = useQuickNotesStore((s) => s.focusTaken);
  const finish = useQuickNotesStore((s) => s.finish);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** Remounts the editor so a saved or dropped body starts empty. */
  const [round, setRound] = useState(0);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const ready = quickNoteTitle(title) !== '' && !saving;

  useEffect(() => {
    if (!pendingFocus) return;
    titleRef.current?.focus();
    focusTaken();
  }, [pendingFocus, focusTaken]);

  const reset = () => {
    setTitle('');
    setBody('');
    setRound((r) => r + 1);
  };

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    const saved = await captureNote(title, body);
    setSaving(false);
    if (!saved) return;
    reset();
    finish();
  };
  const latestSave = useRef(save);
  latestSave.current = save;

  // Ctrl+S saves from anywhere in the form (CLAUDE.md: table-time actions have a hotkey).
  useEffect(
    () =>
      registerHotkey({
        id: 'quickNotes.save',
        combo: 'Ctrl+S',
        description: 'Save the quick note',
        run: () => {
          // Only from inside the form; elsewhere Ctrl+S means nothing in Trifold.
          if (document.activeElement?.closest('.quick-capture')) void latestSave.current();
        },
      }),
    [],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    // Escape belongs to the form here: drop the draft and go back, without closing anything else.
    e.preventDefault();
    e.stopPropagation();
    reset();
    finish();
  };

  return (
    <div className="quick-capture" onKeyDown={onKeyDown} data-testid="quick-capture">
      <input
        ref={titleRef}
        type="text"
        aria-label="Quick note title"
        placeholder="Title (required)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <NoteEditor key={round} markdown="" onChange={setBody} />
      <div className="row quick-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          title={ready ? `Save (${hk('Ctrl+S')})` : 'Give the note a title first'}
          onClick={() => void save()}
        >
          Save
        </button>
        {(title || body) && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              reset();
              finish();
            }}
          >
            Cancel
          </button>
        )}
        <span className="spacer" />
        <span className="muted small">
          <kbd className="kbd">{hk('Ctrl+N')}</kbd> from anywhere
        </span>
      </div>
    </div>
  );
}

/** Move to another folder (out of Quick Notes makes it an ordinary note) and Open in Notes. */
function NoteActions({ note, notes }: { note: Note; notes: readonly Note[] }) {
  const moveNote = useCampaignStore((s) => s.moveNote);
  const folders = useMemo(() => {
    const quickId = quickNotesFolder(notes)?.id;
    return notes
      .filter((n) => n.kind === 'folder')
      .map((f) => ({
        id: f.id,
        label: [...ancestorsOf(notes, f).map((a) => a.title), f.title].join(' / '),
        quick: f.id === quickId || (!!quickId && descendantsOf(notes, quickId).includes(f)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [notes]);
  const here = note.parentId ?? '';

  return (
    <>
      <select
        aria-label="Move to folder"
        title="Move to another folder; outside Quick Notes it becomes an ordinary note"
        value={here}
        onChange={(e) => {
          const parentId = e.target.value || null;
          const index = notes.filter((n) => (n.parentId ?? null) === parentId).length;
          void moveNote(note.id, parentId, index);
        }}
      >
        <option value="">Notes (top level)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
            {f.quick ? '' : ' (leaves quick notes)'}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="chrome-btn"
        aria-label={`Open ${note.title} in Notes`}
        title="Open in the Notes panel"
        onClick={() => navigate({ type: 'note', id: note.id })}
      >
        <Icon name="external" />
      </button>
    </>
  );
}
