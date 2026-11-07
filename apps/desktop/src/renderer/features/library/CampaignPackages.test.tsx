import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignPackageInfo, CampaignSummary } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { CampaignsPage } from './CampaignsPage';

const summary: CampaignSummary = {
  id: 'c1',
  slug: 'sunken-keep',
  name: 'Sunken Keep',
  pcCount: 2,
  encounterCount: 1,
  updatedAt: '2026-09-28T00:00:00.000Z',
};

const file = (existing: CampaignSummary | null): CampaignPackageInfo => ({
  path: 'D:\\Shared\\Sunken Keep.trifold-campaign',
  name: 'Sunken Keep.trifold-campaign',
  sizeBytes: 4096,
  manifest: {
    kind: 'campaign',
    appVersion: '0.1.0',
    librarySchemaVersion: 5,
    campaignSchemaVersion: 1,
    createdAt: '2026-11-07T00:00:00.000Z',
    counts: { campaigns: 1, homebrew: 3, sources: 0 },
    campaign: {
      id: 'c1',
      name: 'Sunken Keep',
      pcs: 0,
      options: { state: 'fresh', party: false, homebrew: true, layout: false },
    },
  },
  existing,
  problem: null,
});

beforeEach(() => {
  useCampaignStore.setState({ campaigns: [summary], current: null, error: null });
});

describe('Export campaign (ADR 0015)', () => {
  it('previews as the options change and exports with them', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.campaigns.exportPreview).mockResolvedValue({
      pcs: 2,
      homebrew: 7,
      importedRecords: 23,
    });
    vi.mocked(window.trifold.campaigns.exportTo).mockResolvedValue(
      'D:\\Sunken Keep.trifold-campaign',
    );
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Export Sunken Keep…' }));
    expect(await screen.findByText('Homebrew it uses (7 records)')).toBeInTheDocument();
    expect(screen.getByTestId('export-imported-note')).toHaveTextContent(
      '23 records from imported sources are not included',
    );

    await user.click(screen.getByRole('radio', { name: 'Fresh start' }));
    await user.click(screen.getByRole('checkbox', { name: 'Party (2 PC cards)' }));
    const fresh = { state: 'fresh', party: false, homebrew: true, layout: false };
    await waitFor(() =>
      expect(window.trifold.campaigns.exportPreview).toHaveBeenLastCalledWith('c1', fresh),
    );
    await user.click(screen.getByRole('button', { name: 'Export…' }));
    await waitFor(() =>
      expect(window.trifold.campaigns.exportTo).toHaveBeenCalledWith('c1', fresh),
    );
    expect(await screen.findByText('Exported to D:\\Sunken Keep.trifold-campaign')).toBeVisible();
  });
});

describe('Import campaign (ADR 0015)', () => {
  it('imports a campaign the Library does not have', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.campaigns.choosePackage).mockResolvedValue(file(null));
    vi.mocked(window.trifold.campaigns.importPackage).mockResolvedValue({
      campaign: summary,
      mode: 'new',
      homebrewAdded: 3,
      homebrewKept: 0,
      unresolved: 23,
      safety: null,
    });
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Import campaign…' }));
    expect(await screen.findByTestId('campaign-package')).toHaveTextContent(
      'Sunken Keep · 0 PC cards · fresh start · 3 homebrew records',
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(window.trifold.campaigns.importPackage).toHaveBeenCalledWith(
        'D:\\Shared\\Sunken Keep.trifold-campaign',
        'new',
      ),
    );
    expect(await screen.findByTestId('campaign-package-result')).toHaveTextContent(
      'Imported Sunken Keep · 3 homebrew records added · 23 records this Library does not have',
    );
  });

  it('asks to replace or copy a campaign the Library already has', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.campaigns.choosePackage).mockResolvedValue(file(summary));
    vi.mocked(window.trifold.campaigns.importPackage).mockResolvedValue({
      campaign: summary,
      mode: 'replace',
      homebrewAdded: 0,
      homebrewKept: 1,
      unresolved: 0,
      safety: '2026-11-07-120000-pre-restore.zip',
    });
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Import campaign…' }));
    expect(await screen.findByText(/This Library already has Sunken Keep/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import as a copy' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Replace…' }));
    expect(window.trifold.campaigns.importPackage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() =>
      expect(window.trifold.campaigns.importPackage).toHaveBeenCalledWith(
        'D:\\Shared\\Sunken Keep.trifold-campaign',
        'replace',
      ),
    );
    expect(await screen.findByTestId('campaign-package-result')).toHaveTextContent(
      'Replaced Sunken Keep · 1 homebrew record already here kept as they were · a backup was written first',
    );
  });

  it('explains a file it will not import', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.campaigns.choosePackage).mockResolvedValue({
      ...file(null),
      problem: 'This is a Library backup; restore it from Settings › Backups',
    });
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Import campaign…' }));
    expect(await screen.findByTestId('campaign-package')).toHaveTextContent('Library backup');
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });
});
