import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceSummary } from '@trifold/api';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { SourcesCard } from './SourcesCard';

/** Source priority (ADR 0027): rows in priority order, moved with the arrows, saved in settings. */
const source = (id: string, name: string, kind: SourceSummary['kind'], edition = '2024') =>
  ({
    schemaVersion: 1,
    id,
    name,
    kind,
    enabled: true,
    defaultEdition: edition,
    edition2024Books: [],
    license: { attribution: null, nonSrd: false },
    importedAt: '2026-11-01T00:00:00.000Z',
    importerVersion: 1,
    recordCounts: { monster: 1, species: 2, class: 3 },
    warnings: [],
    stale: false,
    bundled: kind !== 'xml',
  }) as SourceSummary;

const names = () =>
  screen.getAllByTestId('source-row').map((r) => r.getAttribute('data-source-id'));

/** The Files tab: what was imported, and what ships with Trifold. */
async function openFiles() {
  await userEvent.click(await screen.findByRole('tab', { name: /^Files/ }));
}

describe('SourcesCard files (ADR 0061)', () => {
  beforeEach(() => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      source('srd-2014', 'SRD 5.1', 'srd', '2014'),
      source('srd-2024', 'SRD 5.2', 'srd'),
      source('homebrew', 'Homebrew', 'homebrew'),
    ]);
    useAppStore.setState({
      library: { ok: true, settings: defaultLibrarySettings(), index: { ok: true } } as never,
    });
  });

  it('opens on Books, and lists files in the default order with nothing to drag', async () => {
    render(<SourcesCard />);
    expect(await screen.findByTestId('books-view')).toBeInTheDocument();
    await openFiles();
    await waitFor(() => expect(names()).toEqual(['homebrew', 'srd-2024', 'srd-2014']));
    expect(screen.getByTestId('files-hint')).toHaveTextContent('star books on the Books tab');
    expect(screen.getAllByTestId('source-row')[2]).toHaveTextContent(
      '1 monster, 2 species, 3 classes',
    );
    expect(screen.getAllByTestId('source-row')[0]).toHaveTextContent('your own');
    expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull();
  });
});

describe('SourcesCard 2024 books (ADR 0028)', () => {
  const mixed = {
    ...source('x1', 'Mixed', 'xml', '2014'),
    bundled: false,
    review: {
      books: [
        { name: 'Gloomwood Bestiary', records: 212 },
        { name: 'Gloomwood Bestiary, Revised', records: 188 },
      ],
      duplicates: { monster: 14, spell: 3 },
    },
  } as SourceSummary;

  beforeEach(() => {
    useAppStore.setState({
      library: { ok: true, settings: defaultLibrarySettings(), index: { ok: true } } as never,
    });
  });

  it('says when a file has copies nothing tells apart, and marks books from a checklist', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([mixed]);
    const user = userEvent.setup();
    render(<SourcesCard />);
    await openFiles();
    expect(await screen.findByTestId('source-clash')).toHaveTextContent(
      '14 monsters and 3 spells appear twice in this file, and nothing marks which copy uses 2024 rules.',
    );
    // The clash's own button opens Edit source, where the books are.
    await user.click(screen.getByRole('button', { name: 'Edit source…' }));
    const panel = screen.getByRole('group', { name: 'Books in Mixed' });
    expect(panel).toHaveTextContent('Tick the ones that use 2024 rules');
    expect(panel).toHaveTextContent('212 records');
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Gloomwood Bestiary, Revised' }));
    await user.click(apply);
    expect(window.trifold.sources.setEdition2024Books).toHaveBeenCalledWith('x1', [
      'Gloomwood Bestiary, Revised',
    ]);
    // Edit source stays open after Apply, for the next change.
    expect(screen.getByTestId('edit-source')).toBeInTheDocument();
  });

  it('shows no warning without a clash, but the books stay one click away in Edit source', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      { ...mixed, review: { ...mixed.review!, duplicates: {} } },
    ]);
    const user = userEvent.setup();
    render(<SourcesCard />);
    await openFiles();
    await user.click(await screen.findByRole('button', { name: 'Edit Mixed' }));
    expect(screen.queryByTestId('source-clash')).toBeNull();
    expect(screen.getByRole('group', { name: 'Books in Mixed' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('edit-source')).toBeNull();
  });
});

describe('SourcesCard campaigns (ADR 0036)', () => {
  const campaigns = [
    { id: 'C1', name: 'Silt Springs', slug: 'silt', updatedAt: '', pcCount: 0, encounterCount: 0 },
    { id: 'C2', name: 'Greyford', slug: 'greyford', updatedAt: '', pcCount: 0, encounterCount: 0 },
  ];

  beforeEach(() => {
    vi.mocked(window.trifold.campaigns.list).mockResolvedValue(campaigns);
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      { ...source('file', 'Silt Springs (campaign file)', 'xml'), campaignIds: ['C1'] },
      source('srd-2024', 'SRD 5.2', 'srd'),
    ]);
    vi.mocked(window.trifold.sources.setCampaigns).mockImplementation(async (id, campaignIds) => ({
      ...source(id, 'Silt Springs (campaign file)', 'xml'),
      campaignIds,
    }));
    useAppStore.setState({
      library: { ok: true, settings: defaultLibrarySettings(), index: { ok: true } } as never,
    });
  });

  it('says where an imported file shows and changes it from its row', async () => {
    const user = userEvent.setup();
    render(<SourcesCard />);
    await openFiles();
    await waitFor(() =>
      expect(screen.getByTestId('source-campaigns')).toHaveTextContent('Only Silt Springs'),
    );
    // The SRD always shows; only an imported file has Edit source.
    expect(screen.queryByRole('button', { name: 'Edit SRD 5.2' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit Silt Springs (campaign file)' }));
    const panel = screen.getByTestId('campaigns-panel');
    const shows = within(panel);
    // The last ticked campaign stays ticked: a limited source always shows somewhere.
    expect(shows.getByRole('checkbox', { name: 'Silt Springs' })).toBeDisabled();

    await user.click(shows.getByRole('checkbox', { name: 'Greyford' }));
    expect(window.trifold.sources.setCampaigns).toHaveBeenLastCalledWith('file', ['C1', 'C2']);
    await waitFor(() =>
      expect(screen.getByTestId('source-campaigns')).toHaveTextContent(
        'Only Silt Springs, Greyford',
      ),
    );

    await user.click(screen.getByRole('radio', { name: 'Every campaign' }));
    expect(window.trifold.sources.setCampaigns).toHaveBeenLastCalledWith('file', null);
    await waitFor(() =>
      expect(screen.getByTestId('source-campaigns')).toHaveTextContent('Every campaign'),
    );
    expect(shows.queryByRole('checkbox', { name: 'Greyford' })).toBeNull();

    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByTestId('edit-source')).toBeNull();
  });

  it('shows and changes which campaigns share a source with their players (ADR 0060)', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      {
        ...source('book', 'Gloomwood Bestiary', 'xml'),
        campaignIds: null,
        license: { attribution: null, nonSrd: true },
      },
      source('homebrew', 'Homebrew', 'homebrew'),
    ]);
    vi.mocked(window.trifold.sources.sharing).mockResolvedValue({
      bySource: { book: ['C2'] },
      byCollection: {},
      homebrewByCampaign: { C1: 3 },
    });
    vi.mocked(window.trifold.sources.setShared).mockResolvedValue({
      bySource: { book: ['C2', 'C1'] },
      byCollection: {},
      homebrewByCampaign: { C1: 3 },
    });
    const user = userEvent.setup();
    render(<SourcesCard />);
    await openFiles();
    // Each row says what it is shared in, without opening anything.
    const row = (id: string) =>
      within(document.querySelector<HTMLElement>(`[data-source-id="${id}"]`)!);
    await waitFor(() =>
      expect(row('book').getByTestId('source-shared')).toHaveTextContent(
        'Shared with players in Greyford',
      ),
    );
    expect(row('homebrew').getByTestId('source-shared')).toHaveTextContent(
      'Shared with players: 3 in Silt Springs',
    );
    await user.click(screen.getByRole('button', { name: 'Edit Gloomwood Bestiary' }));
    const share = within(
      screen.getByRole('region', { name: 'Share Gloomwood Bestiary with players' }),
    );
    expect(share.getByRole('checkbox', { name: 'Greyford' })).toBeChecked();
    expect(share.getByRole('note')).toHaveTextContent('marked as user content');
    await user.click(share.getByRole('checkbox', { name: 'Silt Springs' }));
    expect(window.trifold.sources.setShared).toHaveBeenCalledWith('book', ['C2', 'C1']);
    await waitFor(() =>
      expect(row('book').getByTestId('source-shared')).toHaveTextContent(
        'Shared with players in Silt Springs, Greyford',
      ),
    );
  });
});
