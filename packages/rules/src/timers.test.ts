import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDurationLabel,
  idleRun,
  parseDuration,
  pauseRun,
  remainingMs,
  settleRun,
  startRun,
  tvTimer,
} from './timers';

describe('a run, by timestamps', () => {
  const t0 = 1_000_000;

  it('starts from the full duration and counts down by the clock', () => {
    const run = startRun(idleRun(60), 60, t0);
    expect(run).toEqual({ status: 'running', endsAt: t0 + 60_000, leftMs: 60_000 });
    expect(remainingMs(run, t0 + 1_500)).toBe(58_500);
    // However late the next look is, the answer comes from the clock.
    expect(remainingMs(run, t0 + 45_000)).toBe(15_000);
    expect(remainingMs(run, t0 + 90_000)).toBe(0);
  });

  it('pauses with what is left and resumes from there, whenever that is', () => {
    const paused = pauseRun(startRun(idleRun(60), 60, t0), t0 + 20_000);
    expect(paused).toEqual({ status: 'paused', leftMs: 40_000 });
    // Time spent paused does not count.
    expect(remainingMs(paused, t0 + 999_999)).toBe(40_000);
    const resumed = startRun(paused, 60, t0 + 500_000);
    expect(resumed).toEqual({ status: 'running', endsAt: t0 + 540_000, leftMs: 40_000 });
  });

  it('is done once its moment has come, and starts again from the top', () => {
    const run = startRun(idleRun(30), 30, t0);
    expect(settleRun(run, t0 + 29_999)).toBe(run);
    const done = settleRun(run, t0 + 30_000);
    expect(done).toEqual({ status: 'done', leftMs: 0 });
    expect(startRun(done, 30, t0 + 40_000)).toMatchObject({ endsAt: t0 + 70_000 });
  });

  it('leaves a run alone when the step does not apply', () => {
    const idle = idleRun(10);
    expect(pauseRun(idle, t0)).toBe(idle);
    const running = startRun(idle, 10, t0);
    expect(startRun(running, 10, t0 + 5)).toBe(running);
    expect(settleRun(idle, t0 + 99_999)).toBe(idle);
    // Pausing at the very end is done, not paused at zero.
    expect(pauseRun(running, t0 + 10_000)).toEqual({ status: 'done', leftMs: 0 });
  });
});

describe('durations', () => {
  it('reads seconds, clock readings and units', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('2m')).toBe(120);
    expect(parseDuration(' 1m30s ')).toBe(90);
    expect(parseDuration('1h 5m')).toBe(3900);
    expect(parseDuration('45S')).toBe(45);
  });

  it('refuses nonsense, zero, repeats, bad seconds and more than a day', () => {
    for (const bad of ['', 'abc', '0', '1:75', '2m 3m', '1.5m', '-5', '25h', '1:'])
      expect(parseDuration(bad), bad).toBeNull();
    expect(parseDuration('24h')).toBe(86_400);
  });

  it('shows a clock that rounds up until zero', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(9_001)).toBe('0:10');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-50)).toBe('0:00');
    expect(formatClock(3_723_000)).toBe('1:02:03');
  });

  it('labels a duration briefly', () => {
    expect(formatDurationLabel(30)).toBe('30s');
    expect(formatDurationLabel(60)).toBe('1m');
    expect(formatDurationLabel(90)).toBe('1m 30s');
    expect(formatDurationLabel(3900)).toBe('1h 5m');
  });
});

describe('the TV', () => {
  it('shows the first timer marked for it, in list order', () => {
    const t = (id: string, order: number, showOnTv?: boolean) => ({
      id,
      name: id,
      order,
      showOnTv,
    });
    expect(tvTimer([t('a', 2, true), t('b', 0), t('c', 1, true)])?.id).toBe('c');
    expect(tvTimer([t('a', 0)])).toBeNull();
  });
});
