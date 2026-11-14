import { createContext, useContext, useState, type ReactNode } from 'react';
import { parseCommaList } from '@trifold/rules';
import { Icon } from '../shell/icons';

/**
 * The parts every homebrew editor is built from (ADR 0026, ADR 0027): a titled `Section` with a
 * fixed number of columns (narrower panels drop to fewer, see `.editor-grid`), fields whose
 * label sits above an input that fills its column, a row of checkboxes at the foot of a section,
 * and the row actions of the list editors.
 */

export type Cols = 1 | 2 | 3 | 4 | 5 | 6;

export function Section({
  title,
  cols = 2,
  hint,
  checks,
  children,
  testId,
}: {
  title: string;
  cols?: Cols;
  hint?: string;
  /** Checkboxes, on their own line under the fields. */
  checks?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <section className="editor-section" aria-label={title} data-testid={testId}>
      <h3>{title}</h3>
      {hint && <p className="editor-hint">{hint}</p>}
      {children && <div className={`editor-grid cols-${cols}`}>{children}</div>}
      {checks && <div className="editor-checks">{checks}</div>}
    </section>
  );
}

/** How many columns a field spans: 2, or the whole row. */
const spanClass = (span?: 2 | 'all') =>
  span === 2 ? ' span-2' : span === 'all' ? ' span-all' : '';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  span,
  required,
}: {
  label: string;
  value: string | undefined;
  onChange(value: string): void;
  placeholder?: string;
  span?: 2 | 'all';
  required?: boolean;
}) {
  return (
    <label className={`field${spanClass(span)}`}>
      {label}
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  ariaLabel,
  min,
}: {
  label: ReactNode;
  value: number | undefined;
  onChange(value: number | undefined): void;
  ariaLabel?: string;
  min?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        aria-label={ariaLabel}
        min={min}
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value.trim() === '' ? undefined : Number(e.target.value))
        }
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  ariaLabel,
  span,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: ReadonlyArray<readonly [string, string]>;
  ariaLabel?: string;
  span?: 2 | 'all';
}) {
  return (
    <label className={`field${spanClass(span)}`}>
      {label}
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="field inline">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A comma-separated list. It keeps the typed text, so a comma survives until the next word. */
export function ListField({
  label,
  value,
  onChange,
  span,
}: {
  label: string;
  value: readonly string[];
  onChange(value: string[]): void;
  span?: 2 | 'all';
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <label className={`field${spanClass(span)}`}>
      {label}
      <input
        type="text"
        value={text}
        placeholder="Comma-separated"
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseCommaList(e.target.value));
        }}
      />
    </label>
  );
}

/** A long text, the whole width of its section. */
export function TextBlock({
  label,
  value,
  onChange,
  rows = 8,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  rows?: number;
}) {
  return (
    <textarea
      className="span-all"
      aria-label={label}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Up, down and remove for one row of a list editor. */
export function RowActions({
  name,
  index,
  count,
  onMove,
  onRemove,
}: {
  name: string;
  index: number;
  count: number;
  onMove(step: -1 | 1): void;
  onRemove(): void;
}) {
  return (
    <span className="row-actions">
      <button
        type="button"
        className="chrome-btn xs"
        aria-label={`Move ${name} up`}
        title="Move up"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <Icon name="up" />
      </button>
      <button
        type="button"
        className="chrome-btn xs"
        aria-label={`Move ${name} down`}
        title="Move down"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="down" />
      </button>
      <button
        type="button"
        className="chrome-btn xs"
        aria-label={`Remove ${name}`}
        title="Remove"
        onClick={onRemove}
      >
        <Icon name="close" />
      </button>
    </span>
  );
}

export function moved<T>(list: readonly T[], i: number, step: -1 | 1): T[] {
  const j = i + step;
  if (j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * What the editor that wraps a record editor puts in its pinned header (ADR 0035): a title in
 * place of the editor's own, and, once Save was pressed, the Save step in place of the buttons.
 * The record editors themselves never know.
 */
export const EditorHeadContext = createContext<{ title?: string; step?: ReactNode }>({});

/** The pinned header of every editor: its title, Cancel and Save, or the Save step. */
export function EditorHead({
  title,
  saving,
  canSave,
  onCancel,
}: {
  title: string;
  saving: boolean;
  canSave: boolean;
  onCancel(): void;
}) {
  const around = useContext(EditorHeadContext);
  if (around.step) return <div className="editor-head save-step-head">{around.step}</div>;
  return (
    <div className="row editor-head">
      <h2>{around.title ?? title}</h2>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={saving || !canSave}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
