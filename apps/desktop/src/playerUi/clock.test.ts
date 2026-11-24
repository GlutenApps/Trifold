import { afterEach, describe, expect, it, vi } from 'vitest';
import { dmNow, syncClock } from './clock';

describe('the DM clock on a phone', () => {
  afterEach(() => vi.useRealTimers());

  it('counts on the DM computer clock when the phone clock is behind', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    // The DM's clock is 6 s ahead of the phone's: a 10-minute break must read 10:00, not 10:06.
    syncClock(1_006_000);
    expect(dmNow()).toBe(1_006_000);
    vi.advanceTimersByTime(2_000);
    expect(dmNow()).toBe(1_008_000);
  });

  it('ignores a time it cannot read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    syncClock(5_000);
    syncClock(Number.NaN);
    expect(dmNow()).toBe(5_000);
  });
});
