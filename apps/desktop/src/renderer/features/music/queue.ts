/** Pure playlist queue helpers (DESIGN.md §6.6): play order, next/previous, shuffle. */

export interface QueueState {
  /** Track ids in play order (already shuffled when shuffle is on). */
  order: string[];
  /** Index into `order`; -1 before anything played. */
  index: number;
  loop: boolean;
}

/** Fisher–Yates with an injectable RNG; the current track (if any) is kept first. */
export function shuffled(
  ids: readonly string[],
  keepFirst: string | null,
  rng: () => number = Math.random,
): string[] {
  const rest = ids.filter((id) => id !== keepFirst);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return keepFirst && ids.includes(keepFirst) ? [keepFirst, ...rest] : rest;
}

export function buildOrder(
  trackIds: readonly string[],
  shuffle: boolean,
  keepFirst: string | null,
  rng?: () => number,
): string[] {
  return shuffle ? shuffled(trackIds, keepFirst, rng) : [...trackIds];
}

/** The next index, wrapping only when the playlist loops; null at the end otherwise. */
export function nextIndex(state: QueueState, step: 1 | -1 = 1): number | null {
  if (state.order.length === 0) return null;
  const i = state.index + step;
  if (i >= 0 && i < state.order.length) return i;
  if (!state.loop) return null;
  return (i + state.order.length) % state.order.length;
}

/** What repeats: nothing, the whole playlist, or the current track. */
export type LoopMode = 'off' | 'playlist' | 'track';

export function loopMode(loopTrack: boolean, playlistLoop: boolean | null): LoopMode {
  if (loopTrack) return 'track';
  return playlistLoop ? 'playlist' : 'off';
}

/** The loop button's next mode: off → playlist → track → off; a lone track skips "playlist". */
export function nextLoopMode(mode: LoopMode, hasPlaylist: boolean): LoopMode {
  if (mode === 'track') return 'off';
  if (mode === 'playlist' || !hasPlaylist) return 'track';
  return 'playlist';
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
