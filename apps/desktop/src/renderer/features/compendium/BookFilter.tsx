import { useEffect, useMemo, useState } from 'react';
import type { BookSummary, SourceSummary } from '@trifold/api';
import { campaignBooks, type BookCollection } from '@trifold/rules';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCompendiumStore, type BookPick } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { shortSourceName } from './formatting';

/**
 * The compendium's Book filter (ADR 0066): what the list can be limited to, by book rather than
 * by file. The SRD, homebrew, a campaign's creatures and a GM's shared content are not books
 * and are listed by name first; then collections, starred books, and every other book that is
 * on. In a campaign that uses collections, only its books are offered.
 */

/** Sources that are not imported files: listed as themselves. */
const NOT_BOOKS = new Set<SourceSummary['kind']>(['srd', 'homebrew', 'campaign', 'shared']);

const EMPTY: readonly BookCollection[] = [];

/** A book's name in the list; a file's records that cite no book say so. */
export function bookOption(book: Pick<BookSummary, 'name' | 'unnamed'>): string {
  return book.unnamed ? `${book.name} (no book named)` : book.name;
}

/**
 * A source's name in the list. The bundled SRD says so: an imported file can cite a book of the
 * same name, which is listed with the books.
 */
export function sourceOption(source: Pick<SourceSummary, 'kind' | 'name'>): string {
  return source.kind === 'srd' ? `${shortSourceName(source.name)} (bundled)` : source.name;
}

/** The filters a pick stands for. */
export function scopeOf(
  pick: BookPick,
  collections: readonly BookCollection[],
): { sourceIds?: string[]; bookKeys?: string[] } {
  if (pick.startsWith('source:')) return { sourceIds: [pick.slice('source:'.length)] };
  if (pick.startsWith('book:')) return { bookKeys: [pick.slice('book:'.length)] };
  if (pick.startsWith('collection:')) {
    const c = collections.find((x) => x.id === pick.slice('collection:'.length));
    return { bookKeys: [...(c?.bookKeys ?? [])] };
  }
  return {};
}

export function BookFilter() {
  const pick = useCompendiumStore((s) => s.pick);
  const pickBooks = useCompendiumStore((s) => s.pickBooks);
  const sources = useSourcesStore((s) => s.sources);
  const collections = useAppStore((s) => s.library?.settings?.collections ?? EMPTY);
  const campaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  const [books, setBooks] = useState<BookSummary[]>([]);

  // Read again whenever the sources change: an import, a re-parse, a deletion.
  useEffect(() => {
    let live = true;
    window.trifold.books
      .list()
      .then((list) => live && setBooks(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sources]);

  const used = useMemo(() => {
    const keys = campaignBooks(collections, campaignId);
    return keys ? new Set(keys) : null;
  }, [collections, campaignId]);
  const shown = books.filter((b) => !b.off && (!used || used.has(b.key)));
  const starred = shown.filter((b) => b.starred);
  const rest = shown.filter((b) => !b.starred);
  const others = sources.filter((s) => NOT_BOOKS.has(s.kind) && s.enabled);
  const groups = collections.filter(
    (c) => c.bookKeys.length > 0 && (!used || c.bookKeys.some((k) => used.has(k))),
  );

  return (
    <select
      aria-label="Book"
      className="book-filter"
      value={pick}
      onChange={(e) => {
        const next = e.target.value as BookPick;
        pickBooks(next, scopeOf(next, collections));
      }}
    >
      <option value="">Every book</option>
      {others.length > 0 && (
        <optgroup label="Not from a book">
          {others.map((s) => (
            <option key={s.id} value={`source:${s.id}`}>
              {sourceOption(s)}
            </option>
          ))}
        </optgroup>
      )}
      {groups.length > 0 && (
        <optgroup label="Collections">
          {groups.map((c) => (
            <option key={c.id} value={`collection:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {starred.length > 0 && (
        <optgroup label="Starred">
          {starred.map((b) => (
            <option key={b.key} value={`book:${b.key}`}>
              {bookOption(b)}
            </option>
          ))}
        </optgroup>
      )}
      {rest.length > 0 && (
        <optgroup label={starred.length > 0 ? 'Other books' : 'Books'}>
          {rest.map((b) => (
            <option key={b.key} value={`book:${b.key}`}>
              {bookOption(b)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
