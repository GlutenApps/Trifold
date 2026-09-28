import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignSummary } from '@trifold/api';
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

beforeEach(() => {
  useCampaignStore.setState({ campaigns: [summary], current: null, error: null });
});

describe('CampaignsPage delete', () => {
  it('only deletes once DELETE is typed exactly', async () => {
    const user = userEvent.setup();
    window.trifold.campaigns.list = vi.fn(async () => []);
    render(<CampaignsPage />);

    await user.click(screen.getByRole('button', { name: 'Delete Sunken Keep…' }));
    const confirm = screen.getByRole('button', { name: 'Delete campaign' });
    expect(confirm).toBeDisabled();

    const input = screen.getByRole('textbox', { name: 'Type DELETE to delete Sunken Keep' });
    await user.type(input, 'delete');
    expect(confirm).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(window.trifold.campaigns.remove).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'DELETE');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(window.trifold.campaigns.remove).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByText('Sunken Keep')).toBeNull());
  });

  it('keeps the campaign when cancelled', async () => {
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Delete Sunken Keep…' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('button', { name: 'Delete campaign' })).toBeNull();
    expect(window.trifold.campaigns.remove).not.toHaveBeenCalled();
  });
});
