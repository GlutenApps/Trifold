import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSummary, CampaignBundle, CampaignSummary } from '@trifold/api';
import { defaultLibrarySettings, type LibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { SharedTab } from '../players/SharedTab';
import { BooksView } from './BooksView';

const book = (key: string, name: string): BookSummary => ({
  key,
  name,
  unnamed: false,
  tags: [],
  records: 5,
  counts: { spell: 5 },
  editions: { '2024': 5, '2014': 0, unknown: 0 },
  files: [{ id: 'F1', name: 'Big file', records: 5 }],
  starred: false,
  off: false,
});
const books = [
  book('core rules', 'Core Rules'),
  book('setting guide', 'Setting Guide'),
  book('odd one', 'Odd One'),
];
const campaigns: CampaignSummary[] = [
  { id: 'C1', name: 'Greyford', slug: 'g', updatedAt: '', pcCount: 0, encounterCount: 0 },
  { id: 'C2', name: 'Silt Springs', slug: 's', updatedAt: '', pcCount: 0, encounterCount: 0 },
];

/** The Library's settings as main keeps them: what updateSettings was last given. */
let settings: LibrarySettings;

function library(collections: LibrarySettings['collections'] = []) {
  settings = { ...defaultLibrarySettings(), collections };
  useAppStore.setState({ library: { ok: true, settings, index: { ok: true } } as never });
  vi.mocked(window.trifold.library.updateSettings).mockImplementation(async (patch) => {
    settings = { ...settings, ...patch };
    return settings;
  });
}

const saved = () => settings.collections;

beforeEach(() => {
  vi.mocked(window.trifold.books.list).mockResolvedValue(books);
  vi.mocked(window.trifold.books.update).mockResolvedValue(books);
  vi.mocked(window.trifold.books.shareCollection).mockClear();
  vi.mocked(window.trifold.books.shareCollection).mockResolvedValue({
    bySource: {},
    byCollection: { K1: ['C2'] },
    byBook: {},
    homebrewByCampaign: {},
  });
  useCampaignStore.setState({ current: null });
});

describe('collections on the Books tab (ADR 0062)', () => {
  it('makes a collection, fills it from a selection, and filters to it', async () => {
    const user = userEvent.setup();
    library();
    render(<BooksView files={[]} onBrowse={() => undefined} campaigns={campaigns} />);
    await screen.findAllByTestId('book-row');
    await user.type(screen.getByRole('textbox', { name: 'New collection name' }), 'Core{Enter}');
    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0]).toMatchObject({ name: 'Core', bookKeys: [], campaignIds: [] });
    const id = saved()[0]!.id;
    // A new collection opens for editing.
    expect(screen.getByRole('group', { name: 'Edit Core' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Select Core Rules' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Setting Guide' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Add the selected books to a collection' }),
      id,
    );
    await waitFor(() => expect(saved()[0]!.bookKeys).toEqual(['core rules', 'setting guide']));
    expect(screen.getByTestId('collection-row')).toHaveTextContent(
      '2 books · Not used by a campaign',
    );

    // Picking the collection shows only its books, and offers to take books out of it.
    await user.click(screen.getByRole('button', { name: 'Core' }));
    await waitFor(() => expect(screen.getAllByTestId('book-row')).toHaveLength(2));
    await user.click(screen.getByRole('checkbox', { name: 'Select Core Rules' }));
    await user.click(screen.getByRole('button', { name: 'Remove from Core' }));
    await waitFor(() => expect(saved()[0]!.bookKeys).toEqual(['setting guide']));
  }, 15_000);

  it('sets the campaigns that use a collection and share it, and deletes it', async () => {
    const user = userEvent.setup();
    library([{ id: 'K1', name: 'Core', bookKeys: ['core rules'], campaignIds: [] }]);
    const onShared = vi.fn();
    render(
      <BooksView
        files={[]}
        onBrowse={() => undefined}
        campaigns={campaigns}
        sharing={{ bySource: {}, byCollection: {}, byBook: {}, homebrewByCampaign: {} }}
        onShared={onShared}
      />,
    );
    await screen.findAllByTestId('book-row');
    await user.click(screen.getByRole('button', { name: 'Edit Core' }));
    const used = within(screen.getByRole('region', { name: 'Campaigns using Core' }));
    await user.click(used.getByRole('checkbox', { name: 'Greyford' }));
    await waitFor(() => expect(saved()[0]!.campaignIds).toEqual(['C1']));
    expect(screen.getByTestId('collection-row')).toHaveTextContent('Used by Greyford');

    const share = within(screen.getByRole('region', { name: 'Share Core with players' }));
    await user.click(share.getByRole('checkbox', { name: 'Silt Springs' }));
    expect(window.trifold.books.shareCollection).toHaveBeenCalledWith('K1', ['C2']);
    await waitFor(() => expect(onShared).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Delete Core' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // No campaign goes on sharing it, and the collection goes; the books stay.
    await waitFor(() => expect(saved()).toEqual([]));
    expect(window.trifold.books.shareCollection).toHaveBeenLastCalledWith('K1', []);
    expect(screen.getAllByTestId('book-row')).toHaveLength(3);
  });
});

describe('collections on a campaign’s Shared sources tab', () => {
  it('shares a collection with the campaign’s players, and says which books it uses', async () => {
    const user = userEvent.setup();
    library([
      { id: 'K1', name: 'Core', bookKeys: ['core rules', 'setting guide'], campaignIds: ['C1'] },
      { id: 'K2', name: 'Extras', bookKeys: [], campaignIds: [] },
    ]);
    const update = vi.fn(async () => undefined);
    useCampaignStore.setState({
      current: {
        campaign: {
          id: 'C1',
          name: 'Greyford',
          settings: {
            summonable: [],
            shared: { sourceIds: [], homebrewIds: [], collectionIds: [] },
          },
        },
        scenes: [],
      } as unknown as CampaignBundle,
      update: update as never,
    });
    render(<SharedTab />);
    expect(screen.getByTestId('campaign-books')).toHaveTextContent(
      'This campaign’s compendium shows only the books in Core.',
    );
    const list = within(screen.getByRole('list', { name: 'Collections shared with players' }));
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('2 books');
    await user.click(list.getByRole('checkbox', { name: 'Share Core with players' }));
    expect(update).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: [], collectionIds: ['K1'], bookKeys: [] },
      }),
    });
  });
});
