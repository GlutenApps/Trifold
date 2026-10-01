import { describe, expect, it } from 'vitest';
import { buildOrder, formatTime, loopMode, nextIndex, nextLoopMode, shuffled } from './queue';

describe('playlist queue', () => {
  it('shuffles deterministically and keeps the current track first', () => {
    let n = 0;
    const rng = () => [0.1, 0.9, 0.5, 0.3][n++ % 4]!;
    expect(shuffled(['a', 'b', 'c', 'd'], 'c', rng)).toEqual(['c', 'd', 'b', 'a']);
    expect(shuffled(['a', 'b'], null, () => 0)).toHaveLength(2);
    expect(buildOrder(['a', 'b', 'c'], false, 'b')).toEqual(['a', 'b', 'c']);
  });

  it('advances, wraps when looping, and stops at the end otherwise', () => {
    const order = ['a', 'b', 'c'];
    expect(nextIndex({ order, index: 0, loop: false })).toBe(1);
    expect(nextIndex({ order, index: 2, loop: false })).toBeNull();
    expect(nextIndex({ order, index: 2, loop: true })).toBe(0);
    expect(nextIndex({ order, index: 0, loop: true }, -1)).toBe(2);
    expect(nextIndex({ order, index: 0, loop: false }, -1)).toBeNull();
    expect(nextIndex({ order: [], index: -1, loop: true })).toBeNull();
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('cycles loop modes, skipping the playlist mode for a lone track', () => {
    expect(loopMode(false, true)).toBe('playlist');
    expect(loopMode(true, false)).toBe('track');
    expect(loopMode(false, null)).toBe('off');
    expect(nextLoopMode('off', true)).toBe('playlist');
    expect(nextLoopMode('playlist', true)).toBe('track');
    expect(nextLoopMode('track', true)).toBe('off');
    expect(nextLoopMode('off', false)).toBe('track');
    expect(nextLoopMode('track', false)).toBe('off');
  });
});
