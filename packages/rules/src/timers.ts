import { sortCounters } from './counters';

/**
 * Real-world countdowns (ADR 0021). A run is kept as timestamps, never as ticks: a running timer
 * holds the moment it ends (`endsAt`, milliseconds since the epoch), a paused one the time it had
 * left. Time remaining is always worked out from the clock, so a late or skipped redraw can never
 * make a timer drift. Every step is a pure function of the run and `now`.
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface TimerRun {
  status: TimerStatus;
  /** Set while running: when it reaches zero. */
  endsAt?: number;
  /** Time left while idle (the full duration), paused, or done (0). */
  leftMs: number;
}

/** Quick picks in the form: 30 seconds, 1 minute, 5 minutes. */
export const TIMER_PRESETS_SEC = [30, 60, 300] as const;

/** The longest timer: a day. */
export const MAX_TIMER_SEC = 24 * 60 * 60;

/** How many timers the TV shows at once. */
export const MAX_TV_TIMERS = 1;

export function idleRun(durationSec: number): TimerRun {
  return { status: 'idle', leftMs: durationSec * 1000 };
}

/** Milliseconds left at `now`, never below zero. */
export function remainingMs(run: TimerRun, now: number): number {
  if (run.status === 'running' && run.endsAt !== undefined) return Math.max(0, run.endsAt - now);
  return Math.max(0, run.leftMs);
}

/** Start from the top (idle or done), or carry on from where it was paused. */
export function startRun(run: TimerRun, durationSec: number, now: number): TimerRun {
  if (run.status === 'running') return run;
  const left = run.status === 'paused' ? run.leftMs : durationSec * 1000;
  return { status: 'running', endsAt: now + left, leftMs: left };
}

export function pauseRun(run: TimerRun, now: number): TimerRun {
  if (run.status !== 'running') return run;
  const left = remainingMs(run, now);
  return left > 0 ? { status: 'paused', leftMs: left } : { status: 'done', leftMs: 0 };
}

/** A running timer whose moment has come is done; anything else is returned unchanged. */
export function settleRun(run: TimerRun, now: number): TimerRun {
  if (run.status === 'running' && remainingMs(run, now) === 0) return { status: 'done', leftMs: 0 };
  return run;
}

// ---------- durations ----------

/** Seconds for a whole number of whole units, or null. */
const UNIT_SEC: Record<string, number> = { h: 3600, m: 60, s: 1 };

/**
 * A typed duration in seconds, or null when it is not one: `90` (seconds), `1:30` (m:ss),
 * `1:02:03` (h:mm:ss), or units such as `2m`, `1m30s`, `1h 5m`, `45s`. At least one second and at
 * most a day.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let sec: number | null = null;
  if (/^\d+$/.test(t)) sec = Number(t);
  else if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p > 59)) return null;
    sec = parts.reduce((total, p) => total * 60 + p, 0);
  } else if (/^(\d+\s*[hms]\s*)+$/.test(t)) {
    const seen = new Set<string>();
    sec = 0;
    for (const [, n, unit] of t.matchAll(/(\d+)\s*([hms])/g)) {
      if (seen.has(unit!)) return null;
      seen.add(unit!);
      sec += Number(n) * UNIT_SEC[unit!]!;
    }
  }
  if (sec === null || !Number.isSafeInteger(sec) || sec < 1 || sec > MAX_TIMER_SEC) return null;
  return sec;
}

/**
 * A clock reading for time left: `1:05`, `0:09`, `1:02:03`. Rounds up, so it shows `0:01` until
 * the moment it reaches zero.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A duration as a short label: `30s`, `1m`, `1m 30s`, `1h 5m`. */
export function formatDurationLabel(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [h ? `${h}h` : '', m ? `${m}m` : '', s ? `${s}s` : ''].filter(Boolean);
  return parts.join(' ') || '0s';
}

// ---------- the TV ----------

export interface TimerLike {
  id: string;
  name: string;
  order: number;
  showOnTv?: boolean | undefined;
}

/** The timer the TV shows: the first marked for it, in list order, or null. */
export function tvTimer<T extends TimerLike>(timers: readonly T[]): T | null {
  return sortCounters(timers.filter((t) => t.showOnTv))[0] ?? null;
}
