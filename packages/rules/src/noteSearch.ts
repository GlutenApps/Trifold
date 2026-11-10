/**
 * Phrase search over notes with context snippets (ADR 0010). The query is matched as one
 * phrase, case-insensitively, against each note's title and its body with markdown syntax
 * removed, so a hit reads the way the editor shows it.
 */

export interface SearchableNote {
  id: string;
  title: string;
  /** Markdown. */
  body: string;
}

export interface SearchSnippet {
  /** Text before the hit, cut at a word where possible. */
  before: string;
  /** The hit as written in the note. */
  match: string;
  after: string;
  /** Which occurrence in the body this is, counting from 0 in reading order. */
  occurrence: number;
}

export interface NoteSearchHit {
  noteId: string;
  titleMatch: boolean;
  /** Occurrences in the body. */
  count: number;
  /** The first few occurrences with context; `count` says how many there are in all. */
  snippets: SearchSnippet[];
}

export interface NoteSearchOptions {
  maxSnippets?: number;
  /** Characters of context kept on each side of a hit. */
  context?: number;
}

/** Markdown as plain text: headings, emphasis, list markers, links and code fences removed. */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\r\n?/g, '\n')
      // Fenced code: keep the code, drop the fences.
      .replace(/^```[^\n]*\n?/gm, '')
      // Images and links: keep the text.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Block prefixes: headings, quotes, list markers, task boxes.
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
      // Horizontal rules.
      .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
      // Emphasis and inline code markers.
      .replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '$2')
      .replace(/\*(?=\S)(.*?)(?<=\S)\*/g, '$1')
      .replace(/(?<!\w)_(?=\S)(.*?)(?<=\S)_(?!\w)/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      // Collapse the blank lines left behind.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function cutBefore(text: string, end: number, context: number): string {
  const start = Math.max(0, end - context);
  let slice = text.slice(start, end);
  if (start > 0) {
    const space = slice.search(/\s/);
    if (space !== -1 && space < context / 2) slice = slice.slice(space + 1);
    slice = `…${slice}`;
  }
  return slice.replace(/\n+/g, ' ');
}

function cutAfter(text: string, start: number, context: number): string {
  const end = Math.min(text.length, start + context);
  let slice = text.slice(start, end);
  if (end < text.length) {
    const space = slice.lastIndexOf(' ');
    if (space > context / 2) slice = slice.slice(0, space);
    slice = `${slice}…`;
  }
  return slice.replace(/\n+/g, ' ');
}

/** Every occurrence of `phrase` in `text`, case-insensitive, as start offsets. */
export function findPhrase(text: string, phrase: string): number[] {
  const needle = phrase.toLowerCase();
  if (!needle) return [];
  const hay = text.toLowerCase();
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) return out;
    out.push(at);
    from = at + needle.length;
  }
}

/**
 * Every occurrence of `phrase` in plain `text` (markdown already stripped): how many there are
 * and the first `maxSnippets` with context. Callers that search the same text often (global
 * search, ADR 0017) strip it once and keep it.
 */
export function phraseSnippets(
  text: string,
  phrase: string,
  options: NoteSearchOptions = {},
): { count: number; snippets: SearchSnippet[] } {
  const maxSnippets = options.maxSnippets ?? 3;
  const context = options.context ?? 60;
  const offsets = findPhrase(text, phrase);
  return {
    count: offsets.length,
    snippets: offsets.slice(0, maxSnippets).map((at, occurrence) => ({
      before: cutBefore(text, at, context),
      match: text.slice(at, at + phrase.length),
      after: cutAfter(text, at + phrase.length, context),
      occurrence,
    })),
  };
}

/**
 * Notes that contain `query` as a phrase in their title or body, in the order given, each with
 * up to `maxSnippets` snippets of context. An empty query matches nothing.
 */
export function searchNotes<T extends SearchableNote>(
  notes: readonly T[],
  query: string,
  options: NoteSearchOptions = {},
): NoteSearchHit[] {
  const phrase = query.trim();
  if (!phrase) return [];
  const hits: NoteSearchHit[] = [];
  for (const note of notes) {
    const titleMatch = note.title.toLowerCase().includes(phrase.toLowerCase());
    const { count, snippets } = phraseSnippets(stripMarkdown(note.body), phrase, options);
    if (!titleMatch && count === 0) continue;
    hits.push({ noteId: note.id, titleMatch, count, snippets });
  }
  return hits;
}
