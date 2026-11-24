import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage, type CompendiumRecord, type SheetRef } from '@trifold/schema';
import { RecordBody } from '../compendium/RecordDetail';

/**
 * A sheet row linked to a compendium record (ADR 0073; PLAYER-MODE.md, Way 3): opening it shows
 * the record's text, read from the compendium when it opens. A record that is gone (shared
 * content after leaving a campaign, a removed book) says so, and shows again once it is back.
 */
export function LinkedRow({
  sheetRef,
  summary,
  children,
}: {
  sheetRef: SheetRef;
  summary: ReactNode;
  /** The row's own text, shown above the record's. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="sheet-view-feature sheet-view-linked"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{summary}</summary>
      {children}
      {open && <LinkedText sheetRef={sheetRef} />}
    </details>
  );
}

/** A linked record's text, read from the compendium when it is shown. */
export function LinkedText({ sheetRef }: { sheetRef: SheetRef }) {
  const [record, setRecord] = useState<CompendiumRecord | null | 'reading'>('reading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.trifold.compendium
      .findByKey(sheetRef.kind, sheetRef.key)
      .then((found) => live && setRecord(found[0] ?? null))
      .catch((err: unknown) => {
        if (!live) return;
        setRecord(null);
        setError(errorMessage(err));
      });
    return () => {
      live = false;
    };
  }, [sheetRef.kind, sheetRef.key]);

  if (record === 'reading') return <p className="muted small">Reading…</p>;
  if (!record) {
    return (
      <p className="muted small" data-testid="linked-missing">
        {error
          ? `The compendium could not be read: ${error}`
          : `${sheetRef.name} is not in your compendium now. Its text shows again when it is back.`}
      </p>
    );
  }
  return (
    <div className="sheet-view-record" data-testid="linked-record">
      <RecordBody record={record} onOpenSpell={() => undefined} />
    </div>
  );
}
