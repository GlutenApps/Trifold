import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { CompendiumRecord, Source } from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';

/** `sources/<id>/` on disk (DESIGN.md §4.2, DATA-FORMATS.md §5.1–5.2). The files are the truth. */
export class SourceRepository {
  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  dirFor(sourceId: string): string {
    return this.store.resolvePath(`sources/${sourceId}`);
  }

  async list(): Promise<Source[]> {
    const root = this.store.resolvePath('sources');
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      return [];
    }
    const sources: Source[] = [];
    for (const id of entries) {
      const source = await this.get(id);
      if (source) sources.push(source);
    }
    return sources.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(sourceId: string): Promise<Source | null> {
    try {
      const info = await stat(this.dirFor(sourceId));
      if (!info.isDirectory()) return null;
      return await this.store.readJson(`sources/${sourceId}/source.json`, Source, 'source');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `source ${sourceId} skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return null;
    }
  }

  async write(source: Source): Promise<void> {
    await mkdir(this.dirFor(source.id), { recursive: true });
    await this.store.writeJson(`sources/${source.id}/source.json`, source);
  }

  async writeRecords(sourceId: string, records: readonly CompendiumRecord[]): Promise<void> {
    await mkdir(this.dirFor(sourceId), { recursive: true });
    const lines = records.map((r) => JSON.stringify(r));
    await this.store.writeText(`sources/${sourceId}/records.jsonl`, `${lines.join('\n')}\n`);
  }

  /** Streams records.jsonl one record at a time; invalid lines are logged and skipped. */
  async *readRecords(sourceId: string): AsyncGenerator<CompendiumRecord> {
    const file = this.store.resolvePath(`sources/${sourceId}/records.jsonl`);
    try {
      await stat(file);
    } catch {
      return;
    }
    const lines = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    let lineNumber = 0;
    let bad = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try {
        const parsed = CompendiumRecord.safeParse(JSON.parse(line));
        if (parsed.success) yield parsed.data;
        else bad += 1;
      } catch {
        bad += 1;
      }
    }
    if (bad > 0) {
      this.logger.warn(`source ${sourceId}: ${bad} of ${lineNumber} record lines were unreadable`);
    }
  }

  async readAllRecords(sourceId: string): Promise<CompendiumRecord[]> {
    const out: CompendiumRecord[] = [];
    for await (const r of this.readRecords(sourceId)) out.push(r);
    return out;
  }

  async remove(sourceId: string): Promise<void> {
    await rm(this.dirFor(sourceId), { recursive: true, force: true });
  }
}
