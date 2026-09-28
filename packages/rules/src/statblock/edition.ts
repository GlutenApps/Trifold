import { normalizeKey } from '../normalizeKey';

/** Edition and name tags (DATA-FORMATS.md §2.10). */

export type EditionValue = '2024' | '2014' | 'unknown';

export interface ParsedNameTags {
  displayName: string;
  is2024: boolean;
  tags: string[];
}

const TAG_2024 = /\s*\[5\.5e\]\s*$/i;
const NAME_TAGS: Array<[RegExp, string]> = [
  [/\s*\(Legacy\)/i, 'legacy'],
  [/\s*\(UA\)/i, 'unearthed-arcana'],
  [/\s*\(TP\)/i, 'third-party'],
];

/** Strips `[5.5e]`, `(Legacy)`, `(UA)`, `(TP)` from a name into a display name and tags. */
export function parseNameTags(raw: string): ParsedNameTags {
  let name = raw.trim();
  const tags: string[] = [];
  let is2024 = false;
  if (TAG_2024.test(name)) {
    is2024 = true;
    name = name.replace(TAG_2024, '');
  }
  for (const [re, tag] of NAME_TAGS) {
    if (re.test(name)) {
      tags.push(tag);
      name = name.replace(re, '');
    }
  }
  return { displayName: name.replace(/\s+/g, ' ').trim(), is2024, tags };
}

export interface EditionInput {
  is2024: boolean;
  sourceBook?: string | undefined;
  edition2024Books: readonly string[];
  defaultEdition: EditionValue;
}

/** `[5.5e]` suffix → 2024; source book in the configured 2024 list → 2024; else the default. */
export function resolveEdition(input: EditionInput): EditionValue {
  if (input.is2024) return '2024';
  if (input.sourceBook) {
    const key = normalizeKey(input.sourceBook);
    if (input.edition2024Books.some((book) => normalizeKey(book) === key)) return '2024';
  }
  return input.defaultEdition;
}
