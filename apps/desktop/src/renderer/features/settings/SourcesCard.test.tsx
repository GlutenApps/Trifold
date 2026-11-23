import { render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByTestId('files-hint')).toHaveTextContent(
      'Rules, sharing, stars and collections are set on',
    );
    expect(screen.getAllByTestId('source-row')[2]).toHaveTextContent(
      '1 monster, 2 species, 3 classes',
    );
    expect(screen.getAllByTestId('source-row')[0]).toHaveTextContent('your own');
    expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull();
  });
});

describe('SourcesCard files are housekeeping (ADR 0067)', () => {
  const campaigns = [
    { id: 'C1', name: 'Silt Springs', slug: 'silt', updatedAt: '', pcCount: 0, encounterCount: 0 },
    { id: 'C2', name: 'Greyford', slug: 'greyford', updatedAt: '', pcCount: 0, encounterCount: 0 },
  ];
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
    vi.mocked(window.trifold.campaigns.list).mockResolvedValue(campaigns);
    vi.mocked(window.trifold.sources.setCampaigns).mockImplementation(async (id, campaignIds) => ({
      ...source(id, 'Silt Springs (campaign file)', 'xml'),
      bundled: false,
      campaignIds,
    }));
    useAppStore.setState({
      library: { ok: true, settings: defaultLibrarySettings(), index: { ok: true } } as never,
    });
  });

  it('has no Edit source; a clash points to the Books tab, where rules are set', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([mixed]);
    const user = userEvent.setup();
    render(<SourcesCard />);
    await openFiles();
    expect(await screen.findByTestId('source-clash')).toHaveTextContent(
      '14 monsters and 3 spells appear twice in this file, and nothing marks which copy uses 2024 rules.',
    );
    expect(screen.queryByRole('button', { name: 'Edit Mixed' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mark rules on Books…' }));
    expect(screen.getByTestId('books-view')).toBeInTheDocument();
  });

  it('says where a campaign file shows, and widens it to every campaign', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      {
        ...source('file', 'Silt Springs (campaign file)', 'xml'),
        bundled: false,
        campaignIds: ['C1'],
      },
      { ...source('open', 'Open file', 'xml'), bundled: false, campaignIds: null },
      source('srd-2024', 'SRD 5.2', 'srd'),
    ]);
    const user = userEvent.setup();
    render(<SourcesCard />);
    await openFiles();
    await waitFor(() =>
      expect(screen.getByTestId('source-campaigns')).toHaveTextContent('Only in Silt Springs'),
    );
    // A file that shows everywhere says nothing about it.
    expect(screen.getAllByTestId('source-campaigns')).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: 'Use Silt Springs (campaign file) in every campaign' }),
    );
    expect(window.trifold.sources.setCampaigns).toHaveBeenCalledWith('file', null);
  });

  it('says what the homebrew is shared in (ADR 0060)', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      source('homebrew', 'Homebrew', 'homebrew'),
    ]);
    vi.mocked(window.trifold.sources.sharing).mockResolvedValue({
      bySource: {},
      byCollection: {},
      byBook: {},
      homebrewByCampaign: { C1: 3 },
    });
    render(<SourcesCard />);
    await openFiles();
    await waitFor(() =>
      expect(screen.getByTestId('source-shared')).toHaveTextContent(
        'Shared with players: 3 in Silt Springs',
      ),
    );
  });
});
