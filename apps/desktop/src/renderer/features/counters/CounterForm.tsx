import { useId, useState, type FormEvent } from 'react';
import {
  parseCounterDraft,
  type CounterDraft,
  type CounterDraftErrors,
  type CounterFields,
} from '@trifold/rules';

/**
 * Create or edit a counter (ADR 0019): a name, then initial value, minimum and maximum on
 * one line, then the primary step and an optional alternate step. Blank min or max means no
 * bound; a blank primary step means 1; a blank alternate step means the counter has none (no
 * outer buttons, and Shift+arrows use the primary step). Enter saves, Escape cancels.
 */
export function CounterForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CounterDraft;
  submitLabel: string;
  onSubmit(fields: CounterFields): void;
  onCancel(): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<CounterDraft>(initial);
  const [errors, setErrors] = useState<CounterDraftErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = parseCounterDraft(draft);
    if (result.ok) onSubmit(result.fields);
    else setErrors(result.errors);
  };

  // An error sits under its field and is linked to it, never inside the label, so the field
  // keeps its name while the error shows.
  const field = (key: keyof CounterDraft, label: string, placeholder?: string) => (
    <div className={`field counter-field-${key}`}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        type="text"
        inputMode={key === 'name' ? 'text' : 'numeric'}
        value={draft[key]}
        placeholder={placeholder}
        autoFocus={key === 'name'}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(e) => {
          setDraft({ ...draft, [key]: e.target.value });
          if (errors[key]) setErrors({ ...errors, [key]: undefined });
        }}
      />
      {errors[key] && (
        <span id={`${id}-${key}-error`} className="counter-error" role="alert">
          {errors[key]}
        </span>
      )}
    </div>
  );

  return (
    <form
      className="counter-form"
      aria-label={submitLabel}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {field('name', 'Name', 'Ritual rounds')}
      <div className="counter-numbers">
        {field('initial', 'Initial')}
        {field('min', 'Minimum', 'none')}
        {field('max', 'Maximum', 'none')}
      </div>
      <div className="counter-numbers">
        {field('step', 'Primary step', '1')}
        {field('altStep', 'Alternate step', 'none')}
      </div>
      <div className="row counter-form-actions">
        <button type="submit" className="btn primary">
          {submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
