/** Every importer returns records plus warnings and never throws on a single bad record (CLAUDE.md). */
export interface ImportResult<T> {
  records: T[];
  warnings: string[];
}

export type XmlDocumentKind = 'compendium' | 'campaign' | 'unknown';

const BOM = String.fromCharCode(0xfeff);

/**
 * Sniffs the root element of a Lion's Den XML file (DATA-FORMATS.md §1) from its first bytes,
 * so a 31 MB file can be routed without being read in full.
 */
export function detectXmlKind(head: string): XmlDocumentKind {
  const text = head.startsWith(BOM) ? head.slice(1) : head;
  const cleaned = text
    .slice(0, 8192)
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
  const match = /<\s*([A-Za-z_][\w.-]*)/.exec(cleaned);
  const root = match?.[1]?.toLowerCase();
  if (root === 'compendium') return 'compendium';
  if (root === 'campaign') return 'campaign';
  return 'unknown';
}

export * from './compendium/index';
export {
  createRecordStream,
  type RecordStream,
  type RecordStreamHandlers,
} from './xml/recordStream';
export type { XmlNode } from './xml/tree';
