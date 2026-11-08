import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignPackageResult } from '@trifold/api';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { SampleCampaignCard } from './SampleCampaignCard';

const NAME = 'The Lantern at Greyford';

const result = (mode: CampaignPackageResult['mode']): CampaignPackageResult => ({
  campaign: {
    id: 'C1',
    name: NAME,
    slug: 'the-lantern-at-greyford',
  } as CampaignPackageResult['campaign'],
  mode,
  homebrewAdded: 0,
  homebrewKept: 0,
  unresolved: 0,
  safety: mode === 'replace' ? '2026-11-07-preRestore.zip' : null,
});

describe('SampleCampaignCard', () => {
  beforeEach(() => {
    useAppStore.setState({
      library: {
        path: 'C:\\test\\Library',
        ok: true,
        error: null,
        settings: defaultLibrarySettings(),
        index: { ok: true, version: 1, error: null },
      },
    });
  });

  it('adds the sample back when the Library has none', async () => {
    vi.mocked(window.trifold.campaigns.sample)
      .mockResolvedValueOnce({ available: true, present: false, name: NAME })
      .mockResolvedValueOnce({ available: true, present: true, name: NAME });
    vi.mocked(window.trifold.campaigns.addSample).mockResolvedValueOnce(result('new'));
    render(<SampleCampaignCard />);

    expect(await screen.findByText(`${NAME} is not in this Library.`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add the sample campaign' }));
    expect(window.trifold.campaigns.addSample).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(`Added ${NAME}. Open it from Campaigns.`)).toBeInTheDocument();
    expect(await screen.findByText(`${NAME} is in this Library.`)).toBeInTheDocument();
  });

  it('asks before resetting a sample that is already there', async () => {
    vi.mocked(window.trifold.campaigns.sample).mockResolvedValue({
      available: true,
      present: true,
      name: NAME,
    });
    vi.mocked(window.trifold.campaigns.addSample).mockResolvedValueOnce(result('replace'));
    render(<SampleCampaignCard />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reset the sample campaign' }));
    expect(window.trifold.campaigns.addSample).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(window.trifold.campaigns.addSample).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/is back as it ships/)).toBeInTheDocument();
  });

  it('says so when the build has no sample', async () => {
    vi.mocked(window.trifold.campaigns.sample).mockResolvedValueOnce({
      available: false,
      present: false,
      name: null,
    });
    render(<SampleCampaignCard />);
    expect(
      await screen.findByText('This build of Trifold has no sample campaign.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add the sample campaign' })).toBeNull();
  });
});
