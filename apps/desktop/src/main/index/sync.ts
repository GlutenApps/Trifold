import type { IndexStats } from '@trifold/api';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import type { SourceCatalog } from '../sources/catalog';
import { INDEX_VERSION, type IndexDb } from './IndexDb';

/**
 * Brings the derived index in line with the files (DATA-FORMATS.md §5.6): every source whose
 * hash or enabled flag differs from the index row is re-read from its records; index rows for
 * sources no longer present are dropped. Cheap when nothing changed.
 */
export async function syncIndex(
  index: IndexDb,
  catalog: SourceCatalog,
  store: LibraryStore,
  logger: Logger,
  force = false,
): Promise<IndexStats> {
  const started = performance.now();
  const available = await catalog.list();
  const rows = new Map(index.listSourceRows().map((r) => [r.id, r]));

  if (force) index.clearAll();

  for (const source of available) {
    const row = force ? undefined : rows.get(source.id);
    const upToDate =
      row !== undefined &&
      (row.file_hash ?? null) === (source.fileHash ?? null) &&
      row.enabled === (source.enabled ? 1 : 0);
    if (upToDate) continue;
    const t = performance.now();
    const count = index.replaceSource(source, await catalog.readAllRecords(source.id));
    logger.info(
      `index: ${source.name} → ${count} records in ${Math.round(performance.now() - t)} ms`,
    );
  }

  const known = new Set(available.map((s) => s.id));
  for (const id of rows.keys()) {
    if (!known.has(id)) {
      index.removeSource(id);
      logger.info(`index: dropped stale source ${id}`);
    }
  }

  if (store.getSettings().indexVersion !== INDEX_VERSION) {
    await store.updateSettings({ indexVersion: INDEX_VERSION });
  }
  return index.stats(Math.round(performance.now() - started));
}
