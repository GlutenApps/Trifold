import type { TrackKind } from '@trifold/schema';

/**
 * Kind lives in the tag list (DESIGN.md §6.6 kinds + mood tags, one field in the UI): the first
 * kind word among a track's tags sets its layer, and a track with none plays as music.
 */
const KIND_WORDS: Array<[TrackKind, string[]]> = [
  ['ambience', ['ambience', 'ambiance', 'ambient']],
  ['sfx', ['effect', 'effects', 'sfx']],
  ['music', ['music']],
];

/** The tag shown for a kind that was set before kinds became tags. */
const KIND_TAG: Record<TrackKind, string> = { music: 'music', ambience: 'ambience', sfx: 'effect' };

/** Offered while typing, after the tags already in use. */
export const SUGGESTED_TAGS = [
  'music',
  'ambience',
  'effect',
  'combat',
  'tension',
  'tavern',
  'travel',
  'eerie',
  'sad',
  'triumphant',
  'boss',
];

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function kindFromTags(tags: readonly string[]): TrackKind {
  for (const tag of tags) {
    for (const [kind, words] of KIND_WORDS) if (words.includes(tag)) return kind;
  }
  return 'music';
}

/** A track's tags as shown: an older non-music kind with no kind word appears as its tag. */
export function displayTags(track: { kind: TrackKind; tags: readonly string[] }): string[] {
  if (track.kind === 'music' || kindFromTags(track.tags) === track.kind) return [...track.tags];
  return [KIND_TAG[track.kind], ...track.tags];
}

/** Adds tags (deduplicated, normalized) and derives the kind from the result. */
export function withTags(
  tags: readonly string[],
  added: readonly string[],
): { tags: string[]; kind: TrackKind } {
  const next = [...tags];
  for (const raw of added) {
    const tag = normalizeTag(raw);
    if (tag && !next.includes(tag)) next.push(tag);
  }
  return { tags: next, kind: kindFromTags(next) };
}

export function withoutTag(
  tags: readonly string[],
  tag: string,
): { tags: string[]; kind: TrackKind } {
  const next = tags.filter((t) => t !== tag);
  return { tags: next, kind: kindFromTags(next) };
}
