import { useId, useState, type FormEvent } from 'react';
import { formatClock, formatDurationLabel, parseDuration, TIMER_PRESETS_SEC } from '@trifold/rules';
import type { TimerFields } from '../../stores/timersStore';

/**
 * Create or edit a timer (ADR 0021): a name, a duration (typed as `90`, `1:30` or `2m`, or picked
 * from the 30s / 1m / 5m presets) and whether it chimes at zero. Enter saves, Escape cancels. An
 * error sits under its field and is linked to it, never inside the label, so the field keeps its
 * name.
 */
export function TimerForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: TimerFields | null;
  submitLabel: string;
  onSubmit(fields: TimerFields): void;
  onCancel(): void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [duration, setDuration] = useState(
    initial ? formatClock(initial.durationSec * 1000) : '1:00',
  );
  const [chime, setChime] = useState(initial?.chime ?? true);
  const [errors, setErrors] = useState<{ name?: string; duration?: string }>({});
  const picked = parseDuration(duration);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.replace(/\s+/g, ' ').trim();
    const next: typeof errors = {};
    if (!trimmed) next.name = 'Give the timer a name';
    if (picked === null) next.duration = 'Like 90, 1:30 or 2m (up to a day)';
    if (next.name || next.duration || picked === null) return setErrors(next);
    onSubmit({ name: trimmed, durationSec: picked, chime });
  };

  const field = (
    key: 'name' | 'duration',
    label: string,
    value: string,
    change: (v: string) => void,
    placeholder: string,
  ) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={key === 'name'}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(e) => {
          change(e.target.value);
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
      className="timer-form"
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
      {field('name', 'Name', name, setName, 'Decide or the bridge falls')}
      {field('duration', 'Duration', duration, setDuration, '1:30')}
      <div className="row timer-presets" role="group" aria-label="Duration presets">
        {TIMER_PRESETS_SEC.map((sec) => (
          <button
            key={sec}
            type="button"
            className={`btn${picked === sec ? ' on' : ''}`}
            aria-pressed={picked === sec}
            onClick={() => {
              setDuration(formatClock(sec * 1000));
              setErrors({ ...errors, duration: undefined });
            }}
          >
            {formatDurationLabel(sec)}
          </button>
        ))}
      </div>
      <label className="field inline">
        <input type="checkbox" checked={chime} onChange={(e) => setChime(e.target.checked)} />
        Chime at zero
      </label>
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
