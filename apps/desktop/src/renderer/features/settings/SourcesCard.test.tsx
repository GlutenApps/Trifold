import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('SourcesCard priority', () => {
  beforeEach(() => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      source('srd-2014', 'SRD 5.1', 'srd', '2014'),
      source('srd-2024', 'SRD 5.2', 'srd'),
      source('homebrew', 'Homebrew', 'homebrew'),
    ]);
    useAppStore.setState({
      library: { ok: true, settings: defaultLibrarySettings(), index: { ok: true } } as never,
    });
    vi.mocked(window.trifold.library.updateSettings).mockImplementation(async (patch) => ({
      ...defaultLibrarySettings(),
      ...patch,
    }));
  });

  it('lists sources in the default priority and saves a move', async () => {
    const user = userEvent.setup();
    render(<SourcesCard />);
    await waitFor(() => expect(names()).toEqual(['homebrew', 'srd-2024', 'srd-2014']));
    expect(screen.getByTestId('priority-hint')).toHaveTextContent('The top source wins.');
    expect(screen.getAllByTestId('source-row')[2]).toHaveTextContent(
      '1 monster, 2 species, 3 classes',
    );
    expect(screen.getAllByTestId('source-row')[0]).toHaveTextContent('your own');

    const handle = screen.getByRole('button', { name: 'Reorder SRD 5.1, priority 3' });
    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(window.trifold.library.updateSettings).toHaveBeenCalledWith({
      sourcePriority: ['homebrew', 'srd-2014', 'srd-2024'],
    });
    await waitFor(() => expect(names()).toEqual(['homebrew', 'srd-2014', 'srd-2024']));
  });

  it('drags a source by its handle to a new place', async () => {
    render(<SourcesCard />);
    await waitFor(() => expect(names()).toEqual(['homebrew', 'srd-2024', 'srd-2014']));
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), setDragImage: vi.fn() };
    const handle = screen.getByRole('button', { name: 'Reorder SRD 5.1, priority 3' });
    const [homebrew] = screen.getAllByTestId('source-row');
    fireEvent.dragStart(handle, { dataTransfer });
    // A row with no height reads as its lower half: the drop lands after Homebrew.
    fireEvent.dragOver(homebrew!, { dataTransfer, clientY: 0 });
    fireEvent.drop(homebrew!, { dataTransfer, clientY: 0 });
    expect(window.trifold.library.updateSettings).toHaveBeenCalledWith({
      sourcePriority: ['homebrew', 'srd-2014', 'srd-2024'],
    });
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
    expect(await screen.findByTestId('source-clash')).toHaveTextContent(
      '14 monsters and 3 spells appear twice in this file, and nothing marks which copy uses 2024 rules.',
    );
    await user.click(screen.getByRole('button', { name: 'Choose 2024 books…' }));
    const panel = screen.getByTestId('books-panel');
    expect(panel).toHaveTextContent('Which of these books use 2024 rules?');
    expect(panel).toHaveTextContent('212 records');
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Gloomwood Bestiary, Revised' }));
    await user.click(apply);
    expect(window.trifold.sources.setEdition2024Books).toHaveBeenCalledWith('x1', [
      'Gloomwood Bestiary, Revised',
    ]);
    await waitFor(() => expect(screen.queryByTestId('books-panel')).toBeNull());
  });

  it('shows no warning without a clash, but the checklist stays one icon away', async () => {
    vi.mocked(window.trifold.sources.list).mockResolvedValue([
      { ...mixed, review: { ...mixed.review!, duplicates: {} } },
    ]);
    const user = userEvent.setup();
    render(<SourcesCard />);
    await user.click(await screen.findByRole('button', { name: '2024 books in Mixed' }));
    expect(screen.queryByTestId('source-clash')).toBeNull();
    expect(screen.getByTestId('books-panel')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('books-panel')).toBeNull();
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
    await waitFor(() =>
      expect(screen.getByTestId('source-campaigns')).toHaveTextContent('Only Silt Springs'),
    );
    // The SRD always shows; only an imported file has the control.
    expect(screen.queryByRole('button', { name: 'Campaigns for SRD 5.2' })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Campaigns for Silt Springs (campaign file)' }),
    );
    const panel = screen.getByTestId('campaigns-panel');
    // The last ticked campaign stays ticked: a limited source always shows somewhere.
    expect(screen.getByRole('checkbox', { name: 'Silt Springs' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Greyford' }));
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
    expect(screen.queryByRole('checkbox', { name: 'Greyford' })).toBeNull();

    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByTestId('campaigns-panel')).toBeNull();
  });
});
