import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSummary, CampaignBundle, SourceSummary } from '@trifold/api';
import type { CompendiumRecord } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import {
  canShareRecord,
  madeFromUserContent,
  playerFacingCount,
  SharedTab,
  ShareToggle,
} from './SharedTab';

const source = (id: string, extra: Partial<SourceSummary> = {}): SourceSummary =>
  ({
    id,
    name: `Book ${id}`,
    kind: 'xml',
    enabled: true,
    bundled: false,
    campaignIds: null,
    license: { attribution: null, nonSrd: true },
    recordCounts: { spell: 40, feat: 2, monster: 300 },
    ...extra,
  }) as SourceSummary;

const book = (key: string, name: string, extra: Partial<BookSummary> = {}): BookSummary => ({
  key,
  name,
  unnamed: false,
  tags: [],
  records: 342,
  counts: { spell: 40, feat: 2, monster: 300 },
  editions: { '2024': 0, '2014': 342, unknown: 0 },
  files: [{ id: 'S1', name: 'Book S1', records: 342 }],
  starred: false,
  off: false,
  ...extra,
});

const update = vi.fn(async () => undefined);

function open(shared: { sourceIds?: string[]; homebrewIds?: string[]; bookKeys?: string[] } = {}) {
  useCampaignStore.setState({
    current: {
      campaign: {
        id: 'C1',
        name: 'Greyford',
        settings: {
          summonable: [],
          shared: { sourceIds: [], homebrewIds: [], bookKeys: [], ...shared },
        },
      },
      scenes: [],
    } as unknown as CampaignBundle,
    update: update as never,
  });
}

const lantern = {
  id: 'hb-lantern',
  kind: 'item',
  sourceId: 'homebrew',
  displayName: 'Greyford Lantern',
} as CompendiumRecord;

beforeEach(() => {
  update.mockClear();
  vi.mocked(window.trifold.sources.list).mockResolvedValue([
    source('S1'),
    source('S2', { name: 'Only monsters', recordCounts: { monster: 12 } }),
    // Not this campaign's, switched off, or not an imported file: never offered.
    source('S3', { campaignIds: ['OTHER'] }),
    source('S4', { enabled: false }),
    source('srd-2024', { kind: 'srd', bundled: true }),
  ]);
  vi.mocked(window.trifold.books.list).mockResolvedValue([
    book('tome', 'Tome'),
    // Creatures alone, or off: never offered.
    book('beasts', 'Beasts', { counts: { monster: 12 } }),
    book('hidden', 'Hidden', { off: true }),
  ]);
  vi.mocked(window.trifold.compendium.get).mockImplementation(async (id) =>
    id === 'hb-lantern' ? lantern : null,
  );
});

describe('SharedTab', () => {
  it('offers the campaign’s books that hold anything for players, and shares one', async () => {
    open();
    render(<SharedTab />);
    expect(await screen.findByText('No books are shared.')).toBeInTheDocument();
    const pick = screen.getByRole('combobox', { name: 'Share a book with players' });
    await waitFor(() =>
      expect(
        within(pick)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Share a book…', 'Tome (42 for players)']),
    );
    expect(playerFacingCount(source('x'))).toBe(42);
    // Nothing is shared until it is turned on, so nothing is warned about.
    expect(screen.queryByRole('note', { name: 'Sharing user content' })).toBeNull();
    await userEvent.selectOptions(pick, 'tome');
    expect(update).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: [], collectionIds: [], bookKeys: ['tome'] },
      }),
    });
  });

  it('lists shared books and files shared before books, and stops sharing either', async () => {
    open({ bookKeys: ['tome'], sourceIds: ['S2'] });
    render(<SharedTab />);
    const list = await screen.findByRole('list', { name: 'Books shared with players' });
    await waitFor(() => expect(list).toHaveTextContent('Tome'));
    expect(list).toHaveTextContent('42 records for players');
    expect(list).toHaveTextContent('All of Only monsters');
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing Tome' }));
    expect(update).toHaveBeenLastCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: ['S2'], homebrewIds: [], collectionIds: [], bookKeys: [] },
      }),
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop sharing All of Only monsters' }),
    );
    expect(update).toHaveBeenLastCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: [], collectionIds: [], bookKeys: ['tome'] },
      }),
    });
  });

  it('warns while a book marked as user content is shared, and lists shared homebrew', async () => {
    open({ bookKeys: ['tome'], homebrewIds: ['hb-lantern', 'hb-gone'] });
    render(<SharedTab />);
    expect(await screen.findByRole('note', { name: 'Sharing user content' })).toHaveTextContent(
      'It may hold text from outside the SRD.',
    );
    const homebrew = await screen.findByRole('list', { name: 'Homebrew shared with players' });
    await waitFor(() => expect(homebrew).toHaveTextContent('Greyford Lantern'));
    expect(homebrew).toHaveTextContent('A record that is no longer in the compendium');

    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing Greyford Lantern' }));
    expect(update).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: ['hb-gone'], collectionIds: [], bookKeys: ['tome'] },
      }),
    });
  });
});

describe('ShareToggle', () => {
  it('asks before sharing a record made from a source marked as user content', async () => {
    const user = userEvent.setup();
    open();
    useSourcesStore.setState({ sources: [source('S1')] });
    const copy = {
      ...lantern,
      basedOn: { recordId: 'S1:item:lantern', sourceId: 'S1' },
    } as CompendiumRecord;
    expect(madeFromUserContent(copy, [source('S1')])).toBe('Book S1');
    expect(madeFromUserContent(lantern, [source('S1')])).toBeNull();
    render(<ShareToggle record={copy} />);
    await user.click(screen.getByRole('button', { name: 'Share with players' }));
    const ask = screen.getByRole('group', { name: 'Share Greyford Lantern?' });
    expect(ask).toHaveTextContent('Made from Book S1, marked as user content');
    expect(update).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole('button', { name: 'Keep private' }));
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Share with players' }));
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(update).toHaveBeenLastCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: ['hb-lantern'], collectionIds: [], bookKeys: [] },
      }),
    });
    useSourcesStore.setState({ sources: [] });
  });

  it('shares a homebrew record with the open campaign’s players, and stops', async () => {
    open();
    const { rerender } = render(<ShareToggle record={lantern} />);
    const button = screen.getByRole('button', { name: 'Share with players' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(update).toHaveBeenLastCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: ['hb-lantern'], collectionIds: [], bookKeys: [] },
      }),
    });

    open({ homebrewIds: ['hb-lantern'] });
    rerender(<ShareToggle record={lantern} />);
    expect(screen.getByRole('button', { name: 'Share with players' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share with players' }));
    expect(update).toHaveBeenLastCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: [], collectionIds: [], bookKeys: [] },
      }),
    });
  });

  it('is not offered for a creature, for stock content or with no campaign open', () => {
    expect(canShareRecord({ sourceId: 'homebrew', kind: 'item' })).toBe(true);
    expect(canShareRecord({ sourceId: 'homebrew', kind: 'monster' })).toBe(false);
    expect(canShareRecord({ sourceId: 'srd-2024', kind: 'item' })).toBe(false);
    open();
    const { unmount } = render(
      <ShareToggle record={{ ...lantern, kind: 'monster' } as CompendiumRecord} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    useCampaignStore.setState({ current: null });
    render(<ShareToggle record={lantern} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
