import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { AttributionEntry } from '@trifold/api';
import type { SrdManifest, SrdManifestDocument } from '@trifold/importers';
import { CompendiumRecord, type RecordKind, type Source } from '@trifold/schema';
import type { Logger } from '../log';

/**
 * SRD content that ships inside the app package (DESIGN.md §4.2, §6.1): `resources/srd-*.jsonl`
 * plus `srd-manifest.json`, produced at build time by `scripts/fetch-open5e.ts`. Never written
 * to; only enabled or disabled per Library.
 */
export class BundledSources {
  private manifest: SrdManifest | null = null;
  private documents: SrdManifestDocument[] = [];

  constructor(
    private readonly dir: string,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    this.manifest = null;
    this.documents = [];
    const file = join(this.dir, 'srd-manifest.json');
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      this.logger.info('no bundled SRD manifest; run `pnpm fetch:content` to bundle the SRD');
      return;
    }
    try {
      const manifest = JSON.parse(raw) as SrdManifest;
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.documents)) {
        throw new Error('unexpected manifest shape');
      }
      const present: SrdManifestDocument[] = [];
      for (const doc of manifest.documents) {
        try {
          await stat(join(this.dir, doc.file));
          present.push(doc);
        } catch {
          this.logger.warn(`bundled source ${doc.key}: ${doc.file} missing, skipped`);
        }
      }
      this.manifest = manifest;
      this.documents = present;
      this.logger.info(`bundled sources: ${present.map((d) => d.key).join(', ') || 'none'}`);
    } catch (err) {
      this.logger.error(
        `bundled SRD manifest unreadable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  has(sourceId: string): boolean {
    return this.documents.some((d) => d.key === sourceId);
  }

  sources(disabledIds: readonly string[]): Source[] {
    const manifest = this.manifest;
    if (!manifest) return [];
    return this.documents.map((doc) => ({
      schemaVersion: 1,
      id: doc.key,
      name: doc.name,
      kind: 'srd',
      filePath: doc.file,
      fileHash: `sha256:${doc.sha256}`,
      enabled: !disabledIds.includes(doc.key),
      defaultEdition: doc.edition,
      edition2024Books: [],
      license: {
        ...(doc.licenses.some((l) => l.key === 'cc-by-40') ? { spdx: 'CC-BY-4.0' } : {}),
        attribution: doc.attribution,
        nonSrd: false,
      },
      importedAt: manifest.fetchedAt,
      importerVersion: manifest.importerVersion,
      recordCounts: doc.counts as Partial<Record<RecordKind, number>>,
      warnings: doc.warnings,
    }));
  }

  async readAllRecords(sourceId: string): Promise<CompendiumRecord[]> {
    const doc = this.documents.find((d) => d.key === sourceId);
    if (!doc) return [];
    const out: CompendiumRecord[] = [];
    let bad = 0;
    const lines = createInterface({
      input: createReadStream(join(this.dir, doc.file), { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = CompendiumRecord.safeParse(JSON.parse(line));
        if (parsed.success) out.push(parsed.data);
        else bad += 1;
      } catch {
        bad += 1;
      }
    }
    if (bad > 0) this.logger.warn(`bundled source ${sourceId}: ${bad} unreadable records skipped`);
    return out;
  }

  attribution(): AttributionEntry[] {
    const manifest = this.manifest;
    if (!manifest) return [];
    return this.documents.map((doc) => ({
      sourceId: doc.key,
      name: doc.name,
      statement: doc.attribution,
      licenses: doc.licenses.map((l) => ({
        key: l.key,
        name: manifest.licenses[l.key]?.name ?? l.name,
        text: manifest.licenses[l.key]?.text ?? '',
      })),
      permalink: doc.permalink,
    }));
  }
}
