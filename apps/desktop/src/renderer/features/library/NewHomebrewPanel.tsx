import { useEffect, useState } from 'react';
import type { CompendiumRow } from '@trifold/api';
import { errorMessage, type RecordKind } from '@trifold/schema';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { KIND_NAMES } from '../compendium/homebrew';
import { Icon } from '../shell/icons';

/**
 * Library › Compendium › New homebrew (ADR 0026): pick a kind, then start blank or copy an
 * existing record of that kind. Either way the editor opens beside the list; a blank record is
 * written only when it is saved, a copy is written at once (as Duplicate to homebrew does).
 */
const KINDS: RecordKind[] = [
  'monster',
  'spell',
  'item',
  'feat',
  'species',
  'background',
  'class',
  'condition',
];
const PICK_LIMIT = 8;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const editionLabel = (e: string) => (e === '2014' ? 'legacy' : e);

export function NewHomebrewPanel({ onClose }: { onClose(): void }) {
  const current = useCompendiumStore((s) => s.kind);
  const newHomebrew = useCompendiumStore((s) => s.newHomebrew);
  const editCopy = useCompendiumStore((s) => s.editCopy);
  const [kind, setKind] = useState<RecordKind>(current);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const noun = KIND_NAMES[kind];

  // The copy list follows the kind and the typed name, a moment after typing stops.
  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setRows([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      window.trifold.compendium
        .search({ kind, text: query, collapse: false, limit: PICK_LIMIT })
        .then((r) => live && (setRows(r.rows), setError(null)))
        .catch((err: unknown) => live && setError(errorMessage(err)));
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [kind, text]);

  return (
    <div
      className="card new-homebrew"
      data-testid="new-homebrew"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="row new-homebrew-head">
        <strong>New homebrew</strong>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close new homebrew"
          title="Close (Esc)"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="row new-homebrew-ways">
        <label className="field inline">
          Kind
          <select
            aria-label="Homebrew kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as RecordKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {capital(KIND_NAMES[k])}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            onClose();
            void newHomebrew(kind);
          }}
        >
          Start a blank {noun}
        </button>
        <span className="muted">or copy one:</span>
        <input
          type="search"
          className="new-homebrew-find"
          aria-label={`Find a ${noun} to copy`}
          placeholder={`Type a ${noun}'s name to copy and change it`}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error && (
        <p className="warn-text small" role="alert">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="new-homebrew-picks" aria-label={`${capital(noun)}s to copy`}>
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="list-row"
                title={`Copy ${r.displayName} into homebrew and edit it`}
                onClick={() => {
                  onClose();
                  void editCopy(r.id);
                }}
              >
                <span className="list-name">{r.displayName}</span>
                <span className="muted small">
                  {r.sourceName} · {editionLabel(r.edition)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.trim() && rows.length === 0 && !error && (
        <p className="muted small">No {noun} by that name.</p>
      )}
    </div>
  );
}
