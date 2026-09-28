/** `<modifier category="…">ac +2</modifier>` → `{ category, target, value }` (DATA-FORMATS.md §2.14). */
export interface ParsedModifier {
  category: string;
  target: string;
  value: number;
  raw: string;
}

export function parseModifier(category: string | undefined, text: string): ParsedModifier | null {
  const raw = text.trim();
  const m = /^(.*?)\s*([+-]?\s*\d+)\s*$/.exec(raw);
  if (!m?.[2]) return null;
  return {
    category: (category ?? '').trim().toLowerCase(),
    target: (m[1] ?? '').trim().toLowerCase(),
    value: Number(m[2].replace(/\s+/g, '')),
    raw,
  };
}
