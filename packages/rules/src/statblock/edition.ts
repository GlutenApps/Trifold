import { bookKey } from '../books';
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
  if (input.sourceBook && isMarked2024(input.sourceBook, input.edition2024Books)) return '2024';
  return input.defaultEdition;
}

/**
 * Whether `book` is in a list of 2024 books (DATA-FORMATS.md §2.10). An entry names one book
 * exactly when it carries brackets, as the Books tab writes it: "Example Manual (2025)" marks
 * that printing and not "Example Manual (2014)". An entry without brackets, as a DM may type it
 * in Settings, matches loosely: "example manual" marks "Example Manual (2025)", but never a
 * printing whose year is before 2024.
 */
export function isMarked2024(book: string, marked: readonly string[]): boolean {
  const exact = bookKey(book);
  const loose = normalizeKey(book);
  const years = [...book.matchAll(/[([]\s*(\d{4})\s*[)\]]/g)].map((m) => Number(m[1]));
  const older = years.some((y) => y < 2024);
  return marked.some((entry) => {
    if (bookKey(entry) === exact) return true;
    if (/[([]/.test(entry) || older) return false;
    return normalizeKey(entry) === loose;
  });
}
