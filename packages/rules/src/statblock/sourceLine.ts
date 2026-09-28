/** `Source: <Book> p. <N>` citation lines (DATA-FORMATS.md §2.9). */

const SOURCE_LINE = /^\s*Source:\s*(.+?)(?:,?\s*p(?:g|age)?\.?\s*(\d+[\w-]*))?\s*$/im;

export interface ExtractedSource {
  /** The text with the citation line removed and surrounding blank lines collapsed. */
  text: string;
  sourceBook?: string;
  sourcePage?: number;
}

export function extractSourceLine(text: string): ExtractedSource {
  const match = SOURCE_LINE.exec(text);
  if (!match?.[1]) return { text };
  const sourceBook = match[1].trim().replace(/,\s*$/, '');
  const pageNumber = match[2] ? Number.parseInt(match[2], 10) : Number.NaN;
  const cleaned = (text.slice(0, match.index) + text.slice(match.index + match[0].length))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const result: ExtractedSource = { text: cleaned, sourceBook };
  if (Number.isFinite(pageNumber)) result.sourcePage = pageNumber;
  return result;
}
