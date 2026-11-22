/**
 * Books (ADR 0061): the unit a GM manages on Library › Compendium › Sources. A book is named on
 * its records' Source lines (DATA-FORMATS.md §2.9); the same book imported in two files is one
 * book with two copies. Books are data from the imported files; Trifold names none itself.
 */

/**
 * A book's identity: its name lowercased, punctuation dropped, spaces collapsed. Unlike
 * `normalizeKey`, which drops bracketed edition tags from record names, a book keeps what is in
 * its brackets, so a book's 2014 and 2025 printings, or a third-party book that shares a title,
 * stay apart.
 */
export function bookKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The book of an imported file's records that name none: one per file. */
export function unnamedBookKey(sourceId: string): string {
  return `file:${sourceId}`;
}

/** The file an unnamed book stands for, or null for a named book. */
export function unnamedBookSource(key: string): string | null {
  return key.startsWith('file:') ? key.slice('file:'.length) : null;
}

/**
 * Tags a book's name carries in brackets, such as `Third Party`, `Homebrew` or `UA`. A year in
 * brackets is part of the title (a printing), not a tag.
 */
export function bookTags(name: string): string[] {
  const out: string[] = [];
  for (const match of name.matchAll(/\(([^)]+)\)/g)) {
    const tag = match[1]!.trim();
    if (tag && !/^\d{4}$/.test(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
}
