/** `Source: <Book> p. <N>` citation lines (DATA-FORMATS.md §2.9). */

/** The citation line: everything after `Source:` on that line. */
const SOURCE_LINE = /^\s*Source:\s*(.+?)\s*$/im;

/**
 * The first citation on the line: the book, then its page after a comma or a space, then an
 * optional tag in brackets that belongs to the book (`(Third Party)`, `(Homebrew)`). The page
 * must follow a space or a comma, so a book whose name ends in "p" and a number keeps its name.
 */
const CITATION = /^(.+?)(?:,\s*|\s+)p(?:g|age)?\.?\s*(\d+)[\w-]*\s*(\([^)]*\))?/i;

export interface ExtractedSource {
  /** The text with the citation line removed and surrounding blank lines collapsed. */
  text: string;
  sourceBook?: string;
  sourcePage?: number;
}

export function extractSourceLine(text: string): ExtractedSource {
  const match = SOURCE_LINE.exec(text);
  if (!match?.[1]) return { text };
  // A line that lists several books ends each but the last with a comma or a semicolon.
  const line = match[1].replace(/[,;]\s*$/, '').trim();
  const cited = CITATION.exec(line);
  const sourceBook = cited
    ? [cited[1]!.trim().replace(/,\s*$/, ''), cited[3]].filter(Boolean).join(' ')
    : line;
  const pageNumber = cited?.[2] ? Number.parseInt(cited[2], 10) : Number.NaN;
  const cleaned = (text.slice(0, match.index) + text.slice(match.index + match[0].length))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!sourceBook) return { text: cleaned };
  const result: ExtractedSource = { text: cleaned, sourceBook };
  if (Number.isFinite(pageNumber)) result.sourcePage = pageNumber;
  return result;
}
