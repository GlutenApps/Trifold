import { normalizeKey } from '@trifold/rules';
import type { ArtFolderFile } from '@trifold/api';

/**
 * Add from folder (ADR 0033): a file matches the creature whose name it carries, the way the
 * compendium matches names (case, punctuation and edition tags ignored). Words art packs add
 * after the name ("token", "portrait", a number) are let go when the whole name does not match.
 */
const EXTRA_WORDS = new Set([
  'token',
  'tokens',
  'portrait',
  'art',
  'image',
  'icon',
  'topdown',
  'top',
  'down',
  'round',
]);

/** The keys a file name could be, best first. */
export function candidateKeys(fileName: string): string[] {
  const key = normalizeKey(fileName);
  const out = [key];
  const words = key.split(' ');
  while (
    words.length > 1 &&
    (EXTRA_WORDS.has(words[words.length - 1]!) || /^\d+$/.test(words[words.length - 1]!))
  ) {
    words.pop();
    out.push(words.join(' '));
  }
  return [...new Set(out)].filter(Boolean);
}

export interface ArtMatch {
  file: ArtFolderFile;
  key: string;
  name: string;
  /** The creature already has art; it is replaced only when the DM asks. */
  hasArt: boolean;
}

/**
 * Each file's creature, by key; one file per creature (the first in folder order). Files that
 * match nothing are listed apart.
 */
export function matchArtFiles(
  files: readonly ArtFolderFile[],
  creatures: ReadonlyMap<string, { name: string; hasArt: boolean }>,
): { matches: ArtMatch[]; misses: ArtFolderFile[] } {
  const matches: ArtMatch[] = [];
  const misses: ArtFolderFile[] = [];
  const taken = new Set<string>();
  for (const file of files) {
    const key = candidateKeys(file.name).find((k) => creatures.has(k) && !taken.has(k));
    if (!key) {
      misses.push(file);
      continue;
    }
    taken.add(key);
    const creature = creatures.get(key)!;
    matches.push({ file, key, name: creature.name, hasArt: creature.hasArt });
  }
  return { matches, misses };
}
