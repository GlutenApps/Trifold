import { ulid } from 'ulid';
import { CompendiumRecord, type Edition, type RecordKind } from '@trifold/schema';
import type { ImportResult } from '../index';
import { createRecordStream } from '../xml/recordStream';
import { text, type XmlNode } from '../xml/tree';
import type { NormalizeContext } from './context';
import { normalizeMonster } from './monster';
import {
  normalizeBackground,
  normalizeClass,
  normalizeContainer,
  normalizeFeat,
  normalizeItem,
  normalizeSpecies,
  normalizeSpell,
} from './others';

/** Bump when normalization changes in a way that makes existing records.jsonl files stale. */
export const IMPORTER_VERSION = 3;

export interface CompendiumImportOptions {
  sourceId: string;
  defaultEdition: Edition;
  edition2024Books?: readonly string[];
  newId?: () => string;
  /** Warnings beyond this count are summarized (source.json stays readable). */
  maxWarnings?: number;
}

export type RecordCounts = Partial<Record<RecordKind, number>>;

export interface CompendiumImportStats {
  counts: RecordCounts;
  skipped: number;
  warnings: string[];
  rootElement: string | null;
}

export interface CompendiumImporter {
  write(chunk: string): void;
  end(): CompendiumImportStats;
}

const ELEMENT_KIND: Record<string, RecordKind | 'container'> = {
  monster: 'monster',
  spell: 'spell',
  item: 'item',
  feat: 'feat',
  race: 'species',
  background: 'background',
  class: 'class',
  container: 'container',
};

/**
 * Streaming Lion's Den compendium importer (DATA-FORMATS.md §2). Feed it chunks of the file;
 * every completed record is normalized, validated against the schema and handed to `onRecord`.
 * Nothing throws for a single bad record: it becomes a warning and is skipped.
 */
export function createCompendiumImporter(
  options: CompendiumImportOptions,
  onRecord: (record: CompendiumRecord) => void,
): CompendiumImporter {
  const maxWarnings = options.maxWarnings ?? 1000;
  const warnings: string[] = [];
  let overflow = 0;
  const counts: RecordCounts = {};
  let skipped = 0;
  let rootElement: string | null = null;

  const pushWarning = (message: string) => {
    if (warnings.length < maxWarnings) warnings.push(message);
    else overflow += 1;
  };

  // "missing <field>" is expected for vehicles, objects and companions; one line per field with
  // a few names reads better than hundreds of identical warnings (DATA-FORMATS.md §5.1).
  const missing = new Map<string, string[]>();
  const MISSING = /^missing ([a-z ]+)$/i;
  const recordWarning = (kind: string, name: string, message: string) => {
    const m = MISSING.exec(message);
    if (m?.[1]) {
      const key = `${kind}|${m[1]}`;
      const names = missing.get(key) ?? [];
      names.push(name);
      missing.set(key, names);
      return;
    }
    pushWarning(`${kind} "${name}": ${message}`);
  };
  const flushMissing = () => {
    for (const [key, names] of missing) {
      const [kind, field] = key.split('|');
      const shown = names.slice(0, 5).join(', ');
      const more = names.length > 5 ? `, … ${names.length - 5} more` : '';
      pushWarning(
        `${names.length} ${kind}${names.length === 1 ? '' : 's'} missing ${field} (${shown}${more})`,
      );
    }
  };

  const handleRecord = (node: XmlNode) => {
    const kind = ELEMENT_KIND[node.name];
    if (!kind) {
      pushWarning(`unknown element <${node.name}> skipped`);
      skipped += 1;
      return;
    }
    const recordName = text(node, 'name') ?? '?';
    const label = `${node.name} "${recordName}"`;
    const ctx: NormalizeContext = {
      sourceId: options.sourceId,
      defaultEdition: options.defaultEdition,
      edition2024Books: options.edition2024Books ?? [],
      newId: options.newId ?? ulid,
      warn: (message) => recordWarning(node.name, recordName, message),
    };

    let record: CompendiumRecord | null;
    try {
      record = normalize(kind, node, ctx);
    } catch (err) {
      pushWarning(
        `${label}: failed to normalize (${err instanceof Error ? err.message : String(err)})`,
      );
      skipped += 1;
      return;
    }
    if (!record) {
      skipped += 1;
      return;
    }
    const validated = CompendiumRecord.safeParse(record);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      pushWarning(
        `${label}: invalid record skipped (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'schema'})`,
      );
      skipped += 1;
      return;
    }
    counts[validated.data.kind] = (counts[validated.data.kind] ?? 0) + 1;
    onRecord(validated.data);
  };

  const stream = createRecordStream({
    onRoot: (name, attrs) => {
      rootElement = name;
      if (name !== 'compendium') pushWarning(`root element is <${name}>, expected <compendium>`);
      if (attrs['version'] && attrs['version'] !== '5') {
        pushWarning(`compendium version "${attrs['version']}" (expected 5); parsing anyway`);
      }
    },
    onRecord: handleRecord,
    onWarning: pushWarning,
  });

  return {
    write: (chunk) => stream.write(chunk),
    end: () => {
      stream.end();
      flushMissing();
      if (overflow > 0) warnings.push(`… and ${overflow} more warnings`);
      return { counts, skipped, warnings, rootElement };
    },
  };
}

function normalize(
  kind: RecordKind | 'container',
  node: XmlNode,
  ctx: NormalizeContext,
): CompendiumRecord | null {
  switch (kind) {
    case 'monster':
      return normalizeMonster(node, ctx);
    case 'spell':
      return normalizeSpell(node, ctx);
    case 'item':
      return normalizeItem(node, ctx);
    case 'container':
      return normalizeContainer(node, ctx);
    case 'feat':
      return normalizeFeat(node, ctx);
    case 'species':
      return normalizeSpecies(node, ctx);
    case 'background':
      return normalizeBackground(node, ctx);
    case 'class':
      return normalizeClass(node, ctx);
  }
}

/** Convenience for tests and small files: parse a whole document held in memory. */
export function parseCompendiumXml(
  xml: string,
  options: CompendiumImportOptions,
): ImportResult<CompendiumRecord> & CompendiumImportStats {
  const records: CompendiumRecord[] = [];
  const importer = createCompendiumImporter(options, (r) => records.push(r));
  importer.write(xml);
  const stats = importer.end();
  return { records, ...stats };
}
export { featureFromText } from './feature';
