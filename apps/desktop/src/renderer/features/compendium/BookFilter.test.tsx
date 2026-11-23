import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSummary, SourceSummary } from '@trifold/api';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { BookFilter, scopeOf } from './BookFilter';

const book = (key: string, name: string, extra: Partial<BookSummary> = {}): BookSummary => ({
  key,
  name,
  unnamed: false,
  tags: [],
  records: 3,
  counts: { monster: 3 },
  editions: { '2024': 0, '2014': 3, unknown: 0 },
  files: [{ id: 'F1', name: 'Big file', records: 3 }],
  starred: false,
  off: false,
  ...extra,
});

const books = [
  book('tome', 'Tome', { starred: true }),
  book('codex', 'Codex'),
  book('hidden', 'Hidden', { off: true }),
  book('file:F1', 'Big file', { unnamed: true }),
];
const sources = [
  { id: 'srd-2024', name: 'System Reference Document 5.2', kind: 'srd', enabled: true },
  { id: 'homebrew', name: 'Homebrew', kind: 'homebrew', enabled: true },
  { id: 'F1', name: 'Big file', kind: 'xml', enabled: true },
] as unknown as SourceSummary[];
const collections = [
  { id: 'C1', name: 'Gloomwood', bookKeys: ['codex'], campaignIds: [] },
  { id: 'C2', name: 'Empty', bookKeys: [], campaignIds: [] },
];

describe('BookFilter (ADR 0066)', () => {
  beforeEach(() => {
    vi.mocked(window.trifold.books.list).mockResolvedValue(books);
    vi.mocked(window.trifold.compendium.search).mockClear();
    useSourcesStore.setState({ sources });
    useAppStore.setState({
      library: { ok: true, settings: { ...defaultLibrarySettings(), collections } } as never,
    });
    useCampaignStore.setState({ current: null });
    useCompendiumStore.setState({ pick: '', filters: { edition: 'all', npc: 'any' } });
  });

  it('lists what is not a book, collections, starred books, then the rest that are on', async () => {
    render(<BookFilter />);
    const select = screen.getByRole('combobox', { name: 'Book' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(7));
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Every book',
      'SRD 5.2 (bundled)',
      'Homebrew',
      'Gloomwood',
      'Tome',
      'Codex',
      'Big file (no book named)',
    ]);
    expect(
      within(select)
        .getAllByRole('group')
        .map((g) => g.getAttribute('label')),
    ).toEqual(['Not from a book', 'Collections', 'Starred', 'Other books']);
  });

  it('limits the list by book, collection or source', async () => {
    const user = userEvent.setup();
    render(<BookFilter />);
    const select = screen.getByRole('combobox', { name: 'Book' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(7));
    await user.selectOptions(select, 'book:tome');
    expect(useCompendiumStore.getState().filters).toMatchObject({ bookKeys: ['tome'] });
    await user.selectOptions(select, 'collection:C1');
    expect(useCompendiumStore.getState().filters.bookKeys).toEqual(['codex']);
    await user.selectOptions(select, 'source:homebrew');
    expect(useCompendiumStore.getState().filters).toMatchObject({ sourceIds: ['homebrew'] });
    expect(useCompendiumStore.getState().filters.bookKeys).toBeUndefined();
    await user.selectOptions(select, '');
    expect(useCompendiumStore.getState().filters.sourceIds).toBeUndefined();
    expect(window.trifold.compendium.search).toHaveBeenCalled();
  });

  it('offers only the open campaign’s books when it uses collections', async () => {
    useAppStore.setState({
      library: {
        ok: true,
        settings: {
          ...defaultLibrarySettings(),
          collections: [{ ...collections[0]!, campaignIds: ['camp'] }],
        },
      } as never,
    });
    useCampaignStore.setState({ current: { campaign: { id: 'camp' }, scenes: [] } as never });
    render(<BookFilter />);
    const select = screen.getByRole('combobox', { name: 'Book' });
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Codex' })).toBeInTheDocument(),
    );
    expect(within(select).queryByRole('option', { name: 'Tome' })).toBeNull();
  });

  it('maps a pick to the filters it stands for', () => {
    expect(scopeOf('', collections)).toEqual({});
    expect(scopeOf('source:srd-2024', collections)).toEqual({ sourceIds: ['srd-2024'] });
    expect(scopeOf('book:file:F1', collections)).toEqual({ bookKeys: ['file:F1'] });
    expect(scopeOf('collection:C1', collections)).toEqual({ bookKeys: ['codex'] });
  });
});
