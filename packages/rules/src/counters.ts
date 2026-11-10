/**
 * The DM's counters (ADR 0019): a whole number with an optional floor and ceiling, a step and an
 * optional alternate step. Every change goes through `setCounterValue`, which clamps to the
 * bounds and says which bound, if any, the change ran into, so the UI can show it. Up to
 * `MAX_TV_COUNTERS` can be shown on the TV (`tvCounters`).
 */
export interface CounterBounds {
  min?: number | undefined;
  max?: number | undefined;
}

export interface CounterLike extends CounterBounds {
  id: string;
  name: string;
  initial: number;
  value: number;
  /** The main step: the inner pair of buttons and the plain arrow keys. */
  step: number;
  /** A second step, when the DM set one: the outer pair of buttons and Shift+arrows. */
  altStep?: number | undefined;
  /** Shown on the TV, among the first `MAX_TV_COUNTERS` that are. */
  showOnTv?: boolean | undefined;
  order: number;
}

export type CounterBound = 'min' | 'max';

export const DEFAULT_COUNTER_STEP = 1;

/** How many counters the TV shows at once. */
export const MAX_TV_COUNTERS = 3;

/** The step Shift+arrow and PageUp/PageDown use: the alternate step, else the main one. */
export function bigStep(counter: Pick<CounterLike, 'step' | 'altStep'>): number {
  return counter.altStep ?? counter.step;
}

/** `value` held inside the bounds that are set. */
export function clampCounterValue(value: number, bounds: CounterBounds): number {
  let out = Math.trunc(value);
  if (bounds.max !== undefined && out > bounds.max) out = bounds.max;
  if (bounds.min !== undefined && out < bounds.min) out = bounds.min;
  return out;
}

/** The bound the counter sits on now, or null. A counter with min = max sits on `max`. */
export function counterBound(counter: CounterBounds & { value: number }): CounterBound | null {
  if (counter.max !== undefined && counter.value >= counter.max) return 'max';
  if (counter.min !== undefined && counter.value <= counter.min) return 'min';
  return null;
}

export interface CounterChange {
  /** The value after clamping. */
  value: number;
  /**
   * The bound this change ran into: it landed on it or was stopped by it. Null when the change
   * stayed clear of both, and for a change that asked for nothing (the same value again).
   */
  hit: CounterBound | null;
}

/** Asks for `wanted`; gets it clamped, and the bound it hit. */
export function setCounterValue(
  counter: CounterBounds & { value: number },
  wanted: number,
): CounterChange {
  const value = clampCounterValue(wanted, counter);
  if (Math.trunc(wanted) === counter.value) return { value, hit: null };
  const up = wanted > counter.value;
  if (up && counter.max !== undefined && value === counter.max) return { value, hit: 'max' };
  if (!up && counter.min !== undefined && value === counter.min) return { value, hit: 'min' };
  return { value, hit: null };
}

/** Adds `delta` (negative to take away). */
export function adjustCounter(
  counter: CounterBounds & { value: number },
  delta: number,
): CounterChange {
  return setCounterValue(counter, counter.value + delta);
}

/** Whether a press in this direction can still change the value. */
export function canAdjust(counter: CounterBounds & { value: number }, direction: 1 | -1): boolean {
  if (direction > 0) return counter.max === undefined || counter.value < counter.max;
  return counter.min === undefined || counter.value > counter.min;
}

// ---------- the create / edit form ----------

/**
 * What the form holds: text, as typed. Blank min, max or alternate step means "not set"; a blank
 * step means 1.
 */
export interface CounterDraft {
  name: string;
  initial: string;
  min: string;
  max: string;
  step: string;
  altStep: string;
}

export interface CounterFields {
  name: string;
  initial: number;
  min?: number;
  max?: number;
  step: number;
  altStep?: number;
}

export type CounterDraftErrors = Partial<Record<keyof CounterDraft, string>>;

export type CounterDraftResult =
  { ok: true; fields: CounterFields } | { ok: false; errors: CounterDraftErrors };

export const EMPTY_COUNTER_DRAFT: CounterDraft = {
  name: '',
  initial: '0',
  min: '',
  max: '',
  step: String(DEFAULT_COUNTER_STEP),
  altStep: '',
};

/** The form for editing an existing counter. */
export function draftOf(counter: CounterLike): CounterDraft {
  const text = (n: number | undefined) => (n === undefined ? '' : String(n));
  return {
    name: counter.name,
    initial: String(counter.initial),
    min: text(counter.min),
    max: text(counter.max),
    step: String(counter.step),
    altStep: text(counter.altStep),
  };
}

const WHOLE = /^[-−]?\d+$/;

/** A typed whole number (a typographic minus is fine); null when it is not one. */
export function parseWhole(text: string): number | null {
  const t = text.trim();
  if (!WHOLE.test(t)) return null;
  const n = Number(t.replace('−', '-'));
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Checks the form: a name, a whole-number initial value inside the bounds, optional whole-number
 * bounds with min ≤ max, a step of at least 1 (blank means 1) and an optional alternate step of
 * at least 1.
 */
export function parseCounterDraft(draft: CounterDraft): CounterDraftResult {
  const errors: CounterDraftErrors = {};
  const name = draft.name.replace(/\s+/g, ' ').trim();
  if (!name) errors.name = 'Give the counter a name';

  const initial = draft.initial.trim() === '' ? 0 : parseWhole(draft.initial);
  if (initial === null) errors.initial = 'A whole number';

  const optional = (key: 'min' | 'max'): number | undefined => {
    if (draft[key].trim() === '') return undefined;
    const n = parseWhole(draft[key]);
    if (n === null) errors[key] = 'A whole number, or blank';
    return n ?? undefined;
  };
  const min = optional('min');
  const max = optional('max');
  if (min !== undefined && max !== undefined && min > max) errors.max = 'At least the minimum';

  const stepText = draft.step.trim();
  const step = stepText === '' ? DEFAULT_COUNTER_STEP : parseWhole(stepText);
  if (step === null || step < 1) errors.step = 'A whole number, 1 or more';

  const altText = draft.altStep.trim();
  const altStep = altText === '' ? undefined : parseWhole(altText);
  if (altStep === null || (altStep !== undefined && altStep < 1)) {
    errors.altStep = 'A whole number, 1 or more, or blank';
  }

  if (initial !== null && !errors.min && !errors.max) {
    if (min !== undefined && initial < min) errors.initial = 'At least the minimum';
    else if (max !== undefined && initial > max) errors.initial = 'At most the maximum';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const fields: CounterFields = { name, initial: initial ?? 0, step: step ?? DEFAULT_COUNTER_STEP };
  if (min !== undefined) fields.min = min;
  if (max !== undefined) fields.max = max;
  if (altStep !== undefined && altStep !== null) fields.altStep = altStep;
  return { ok: true, fields };
}

/**
 * An edited counter: the new fields, with the current value pulled inside the new bounds. The
 * value is otherwise kept, so renaming mid-fight does not reset it.
 */
export function applyCounterFields<T extends CounterLike>(counter: T, fields: CounterFields): T {
  const next: T = { ...counter, name: fields.name, initial: fields.initial, step: fields.step };
  delete next.min;
  delete next.max;
  delete next.altStep;
  if (fields.min !== undefined) next.min = fields.min;
  if (fields.max !== undefined) next.max = fields.max;
  if (fields.altStep !== undefined) next.altStep = fields.altStep;
  next.value = clampCounterValue(counter.value, next);
  return next;
}

// ---------- the TV ----------

/** A counter as the TV shows it: no initial value, steps or order. */
export interface TvCounter {
  id: string;
  name: string;
  value: number;
  /** Shown as "value / max" when set. */
  max?: number;
  bound: CounterBound | null;
}

/** The counters the TV shows: the first `MAX_TV_COUNTERS` marked for it, in list order. */
export function tvCounters(counters: readonly CounterLike[]): TvCounter[] {
  return sortCounters(counters.filter((c) => c.showOnTv))
    .slice(0, MAX_TV_COUNTERS)
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: c.value,
      ...(c.max !== undefined ? { max: c.max } : {}),
      bound: counterBound(c),
    }));
}

/** Whether this counter could be put on the TV now: it is on already, or there is room. */
export function canShowOnTv(counters: readonly CounterLike[], id: string): boolean {
  const target = counters.find((c) => c.id === id);
  if (target?.showOnTv) return true;
  return counters.filter((c) => c.showOnTv).length < MAX_TV_COUNTERS;
}

// ---------- order ----------

/** Counters in list order (ties by name, then id, so the list never shuffles). */
export function sortCounters<T extends Pick<CounterLike, 'order' | 'name' | 'id'>>(
  counters: readonly T[],
): T[] {
  return [...counters].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/**
 * Puts counter `id` at `index` (in the list without it) and renumbers the list from 0. Returns
 * the counters whose `order` changed; empty when nothing moved or the id is unknown.
 */
export function moveCounter<T extends Pick<CounterLike, 'order' | 'name' | 'id'>>(
  counters: readonly T[],
  id: string,
  index: number,
): T[] {
  const list = sortCounters(counters);
  const from = list.findIndex((c) => c.id === id);
  if (from < 0) return [];
  const [moved] = list.splice(from, 1);
  const at = Math.max(0, Math.min(list.length, Math.trunc(index)));
  list.splice(at, 0, moved!);
  return list.flatMap((c, i) => (c.order === i ? [] : [{ ...c, order: i }]));
}

/** The `order` for a new counter: after every other one. */
export function nextCounterOrder(counters: readonly Pick<CounterLike, 'order'>[]): number {
  return Math.max(-1, ...counters.map((c) => c.order)) + 1;
}
