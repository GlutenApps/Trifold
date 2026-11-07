import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelSave, flushPendingSaves, hasPendingSave, scheduleSave } from './pendingSaves';

describe('pendingSaves', () => {
  afterEach(() => vi.useRealTimers());

  it('runs the latest save for a slot once its delay passes', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    scheduleSave('slot', first, 100);
    scheduleSave('slot', second, 100);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(hasPendingSave('slot')).toBe(false);
  });

  it('flushes every waiting save at once and waits for their writes', async () => {
    let written = false;
    const write = () =>
      new Promise<void>((done) =>
        setTimeout(() => {
          written = true;
          done();
        }, 5),
      );
    const failing = vi.fn(() => Promise.reject(new Error('disk full')));
    const key = {};
    scheduleSave(key, write, 10_000);
    scheduleSave('other', failing, 10_000);
    await flushPendingSaves();
    expect(written).toBe(true);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(hasPendingSave(key)).toBe(false);
  });

  it('drops a cancelled save', async () => {
    const run = vi.fn();
    scheduleSave('gone', run, 10_000);
    cancelSave('gone');
    await flushPendingSaves();
    expect(run).not.toHaveBeenCalled();
  });
});
