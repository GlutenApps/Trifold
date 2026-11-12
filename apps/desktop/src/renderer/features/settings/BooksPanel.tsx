import { useEffect, useRef, useState } from 'react';
import type { SourceSummary } from '@trifold/api';
import { isMarked2024 } from '@trifold/rules';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';

/**
 * Which of an imported file's books use 2024 rules (ADR 0028). A file that mixes old and new
 * books without tagging the new ones gives two copies of a record with nothing to tell them
 * apart; the source's row says so (`clashLine`), and this checklist of the file's books fixes
 * it. Applying re-tags the file's records at once.
 */

const NOUNS: Record<string, [string, string]> = {
  monster: ['monster', 'monsters'],
  spell: ['spell', 'spells'],
  item: ['item', 'items'],
  feat: ['feat', 'feats'],
  species: ['species', 'species'],
  background: ['background', 'backgrounds'],
  class: ['class', 'classes'],
  condition: ['condition', 'conditions'],
};

/** "14 monsters and 3 spells appear twice in this file…", or null when nothing clashes. */
export function clashLine(source: SourceSummary): string | null {
  const entries = Object.entries(source.review?.duplicates ?? {}).filter(([, n]) => (n ?? 0) > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, n]) => sum + (n ?? 0), 0);
  const parts = entries.map(([kind, n]) => {
    const [one, many] = NOUNS[kind] ?? [kind, `${kind}s`];
    return `${n} ${n === 1 ? one : many}`;
  });
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${list} ${total === 1 ? 'appears' : 'appear'} twice in this file, and nothing marks which copy uses 2024 rules.`;
}

export function BooksPanel({ source, onClose }: { source: SourceSummary; onClose(): void }) {
  const books = source.review?.books ?? [];
  const importing = useSourcesStore((s) => s.importing);
  const apply = useSourcesStore((s) => s.setEdition2024Books);
  const initial = books
    .filter((b) => isMarked2024(b.name, source.edition2024Books))
    .map((b) => b.name);
  const panelRef = useRef<HTMLDivElement>(null);
  // Opening moves the keyboard into the checklist, so Escape closes it at once.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, []);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial));
  const changed = checked.size !== initial.length || initial.some((name) => !checked.has(name));

  const toggle = (name: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  const save = async () => {
    const names = books.filter((b) => checked.has(b.name)).map((b) => b.name);
    if (await apply(source.id, names)) onClose();
  };

  return (
    <div
      ref={panelRef}
      className="books-panel"
      role="group"
      aria-label={`2024 books in ${source.name}`}
      data-testid="books-panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="books-panel-head">
        <strong>Which of these books use 2024 rules?</strong>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close 2024 books"
          title="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted small">
        Records from a ticked book are labelled 2024 rules; the rest are legacy. Records the file
        already tags as 2024 stay that way.
      </p>
      {books.length === 0 ? (
        <p className="muted">This file doesn’t name any books on its records’ Source lines.</p>
      ) : (
        <ul className="books-list">
          {books.map((b) => (
            <li key={b.name}>
              <label>
                <input
                  type="checkbox"
                  checked={checked.has(b.name)}
                  onChange={(e) => toggle(b.name, e.target.checked)}
                />
                <span className="books-name">{b.name}</span>
              </label>
              <span className="muted small">
                {b.records} record{b.records === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="books-panel-foot">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!changed || importing}
          onClick={() => void save()}
        >
          {importing ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
}
