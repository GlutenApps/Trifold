import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage, type CompendiumRecord, type SheetRef } from '@trifold/schema';
import { RecordBody } from '../compendium/RecordDetail';
import { Icon } from '../shell/icons';

/**
 * A row on the sheet (ADR 0080): a spell, a feature or an item. One with something to read (its
 * own text, or a compendium record it links to, ADR 0073) opens in place from its name, which is
 * a button with a chevron; the record is read from the compendium when it opens, and a record
 * that is gone says so. One with nothing to read is plain text, with a blank where the chevron
 * would be so the names line up. Only a row that does something lights up on hover.
 */
export function SheetRow({
  name,
  sheetRef,
  text,
  muted,
  after,
  actions,
  below,
  className,
}: {
  name: string;
  sheetRef?: SheetRef | undefined;
  /** The row's own text, shown above the record's. */
  text?: string | undefined;
  /** An unprepared spell: the name is dimmed. */
  muted?: boolean;
  /** What follows the name: a source, a badge, a quantity, a row of pips. */
  after?: ReactNode;
  /** Quiet per-row actions (ADR 0020), always on screen, full when the row is hovered. */
  actions?: ReactNode;
  /** Shown under the row while it is being changed in place: an item's editor. */
  below?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const opens = !!sheetRef || !!text?.trim();
  const live = opens || !!actions;
  return (
    <div className={`sh-item${className ? ` ${className}` : ''}`}>
      <div className={`sh-row${live ? ' acts' : ''}${muted ? ' muted-row' : ''}`}>
        {opens ? (
          <button
            type="button"
            className="sh-disc"
            aria-expanded={open}
            title={open ? `Close ${name}` : `Read ${name}`}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sh-chev">
              <Icon name="right" size={12} />
            </span>
            <span className="sh-name">{name}</span>
          </button>
        ) : (
          <span className="sh-plain">
            <span className="sh-chev" aria-hidden="true" />
            <span className="sh-name">{name}</span>
          </span>
        )}
        {after}
        {actions && <span className="row-actions">{actions}</span>}
      </div>
      {below}
      {open && (
        <div className="sh-expand">
          {text?.trim() && <p className="sh-text">{text}</p>}
          {sheetRef && <LinkedText sheetRef={sheetRef} />}
        </div>
      )}
    </div>
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
