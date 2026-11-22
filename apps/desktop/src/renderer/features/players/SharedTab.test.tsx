import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, SourceSummary } from '@trifold/api';
import type { CompendiumRecord } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { canShareRecord, playerFacingCount, SharedTab, ShareToggle } from './SharedTab';

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

const update = vi.fn(async () => undefined);

function open(shared: { sourceIds?: string[]; homebrewIds?: string[] } = {}) {
  useCampaignStore.setState({
    current: {
      campaign: {
        id: 'C1',
        name: 'Greyford',
        settings: { summonable: [], shared: { sourceIds: [], homebrewIds: [], ...shared } },
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
  vi.mocked(window.trifold.compendium.get).mockImplementation(async (id) =>
    id === 'hb-lantern' ? lantern : null,
  );
});

describe('SharedTab', () => {
  it('offers the campaign’s imported sources, counting only what players would get', async () => {
    open();
    render(<SharedTab />);
    const list = await screen.findByRole('list', { name: 'Sources shared with players' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    const [book, monsters] = within(list).getAllByRole('listitem');
    expect(book).toHaveTextContent('Book S1');
    expect(book).toHaveTextContent('42 records for players');
    expect(book).toHaveTextContent('user content');
    // A source of creatures alone has nothing to share.
    expect(monsters).toHaveTextContent('nothing for players in it');
    expect(within(monsters!).getByRole('checkbox')).toBeDisabled();
    expect(playerFacingCount(source('x'))).toBe(42);
    // Nothing is shared until it is turned on, so nothing is warned about.
    expect(within(book!).getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByRole('note', { name: 'Sharing user content' })).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Share Book S1 with players' }));
    expect(update).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: ['S1'], homebrewIds: [], collectionIds: [] },
      }),
    });
  });

  it('warns while a source marked as user content is shared, and lists shared homebrew', async () => {
    open({ sourceIds: ['S1'], homebrewIds: ['hb-lantern', 'hb-gone'] });
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
        shared: { sourceIds: ['S1'], homebrewIds: ['hb-gone'], collectionIds: [] },
      }),
    });
  });
});

describe('ShareToggle', () => {
  it('shares a homebrew record with the open campaign’s players, and stops', async () => {
    open();
    const { rerender } = render(<ShareToggle record={lantern} />);
    const button = screen.getByRole('button', { name: 'Share with players' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(update).toHaveBeenLastCalledWith({
      settings: expect.objectContaining({
        shared: { sourceIds: [], homebrewIds: ['hb-lantern'], collectionIds: [] },
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
        shared: { sourceIds: [], homebrewIds: [], collectionIds: [] },
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
