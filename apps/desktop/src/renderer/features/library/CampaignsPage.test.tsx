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

describe('CampaignsPage create', () => {
  it('opens one panel with a blank campaign, a Trifold file and a Game Master file', async () => {
    const user = userEvent.setup();
    window.trifold.campaigns.create = vi.fn(async () => {
      throw new Error('not mocked');
    });
    render(<CampaignsPage />);
    expect(screen.queryByRole('textbox', { name: 'New campaign name' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    const panel = screen.getByTestId('campaign-create');
    expect(panel).toHaveTextContent('New blank campaign');
    expect(panel).toHaveTextContent('Import a Trifold campaign');
    expect(panel).toHaveTextContent('Import from Game Master');

    const name = screen.getByRole('textbox', { name: 'New campaign name' });
    expect(name).toHaveFocus();

    // The help explains what Game Master is, and only when asked.
    expect(screen.queryByTestId('game-master-help')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'What is Game Master?' }));
    expect(screen.getByTestId('game-master-help')).toHaveTextContent('separate app for DMs');

    await user.type(name, 'Sunken Keep{Enter}');
    await waitFor(() =>
      expect(window.trifold.campaigns.create).toHaveBeenCalledWith('Sunken Keep'),
    );
  });

  it('imports Game Master XML as a new campaign and closes the panel', async () => {
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    await user.click(screen.getByRole('button', { name: 'Choose XML file…' }));
    expect(window.trifold.campaigns.chooseXmlFile).toHaveBeenCalled();
    expect(screen.queryByTestId('campaign-create')).toBeNull();
  });

  it('Escape closes the panel', async () => {
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('campaign-create')).toBeNull();
  });
});

describe('CampaignsPage order and filter', () => {
  const many = (n: number): CampaignSummary[] =>
    Array.from({ length: n }, (_, i) => ({
      ...summary,
      id: `c${i + 1}`,
      slug: `c${i + 1}`,
      name: i === 0 ? 'The Lantern at Greyford' : `Campaign ${i + 1}`,
    }));

  it('says when each campaign was opened, or when it changed if it has not been', () => {
    const opened = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    useCampaignStore.setState({
      campaigns: [
        { ...summary, openedAt: opened },
        { ...summary, id: 'c2', name: 'Old Keep' },
      ],
    });
    render(<CampaignsPage />);
    expect(screen.getByText('opened 3 days ago')).toBeInTheDocument();
    expect(
      screen.getByText(`updated ${new Date(summary.updatedAt).toLocaleDateString()}`),
    ).toBeInTheDocument();
  });

  it('offers no filter for a short list', () => {
    useCampaignStore.setState({ campaigns: many(8) });
    render(<CampaignsPage />);
    expect(screen.queryByRole('searchbox', { name: 'Filter campaigns' })).toBeNull();
  });

  it('filters a long list by name, and says when nothing matches', async () => {
    const user = userEvent.setup();
    useCampaignStore.setState({ campaigns: many(9) });
    render(<CampaignsPage />);
    const field = screen.getByRole('searchbox', { name: 'Filter campaigns' });
    await user.type(field, 'grey lantern');
    expect(screen.getByText('The Lantern at Greyford')).toBeInTheDocument();
    expect(screen.queryByText('Campaign 2')).toBeNull();
    await user.clear(field);
    await user.type(field, 'nothing like it');
    expect(screen.getByText(/No running campaigns match/)).toBeInTheDocument();
  });
});
