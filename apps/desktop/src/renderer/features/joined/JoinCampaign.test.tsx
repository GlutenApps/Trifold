import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppInfo, FoundTableSummary, JoinedSummary } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { CampaignsPage } from '../library/CampaignsPage';

const info = (): AppInfo => ({
  version: '0.0.0-test',
  electron: '0',
  chrome: '0',
  node: '0',
  platform: 'win32',
  userDataPath: 'C:\\test',
});

const greyford: FoundTableSummary = {
  campaignId: 'c1',
  campaignName: 'The Lantern at Greyford',
  address: '192.168.1.23:8130',
  joined: false,
};

const joinedGreyford: JoinedSummary = {
  campaignId: 'c1',
  campaignName: 'The Lantern at Greyford',
  displayName: 'Sam',
  characterId: null,
  joinedAt: '2026-11-23T18:00:00.000Z',
  lastLiveAt: null,
  openedAt: null,
  claimed: false,
};

/** Lets the test play main: hands the page what the search found. */
let tablesFound: (tables: FoundTableSummary[]) => void = () => undefined;

beforeEach(() => {
  useAppStore.setState({ info: info() });
  useCampaignStore.setState({ campaigns: [], current: null, error: null });
  useJoinedStore.setState({ joined: [], tables: [], searching: false, error: null });
  window.trifold.joined.list = vi.fn(async () => []);
  window.trifold.joined.startSearch = vi.fn(async () => []);
  window.trifold.joined.stopSearch = vi.fn(async () => undefined);
  window.trifold.on = vi.fn((event: string, listener: (payload: never) => void) => {
    if (event === 'joinedTables') tablesFound = listener as typeof tablesFound;
    return () => undefined;
  }) as never;
});

describe('Join a campaign', () => {
  it('searches only while the panel is open', async () => {
    const user = userEvent.setup();
    render(<CampaignsPage />);
    expect(window.trifold.joined.startSearch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Join a campaign' }));
    await waitFor(() => expect(window.trifold.joined.startSearch).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Looking for tables…');
    await user.click(screen.getByRole('button', { name: 'Join a campaign' }));
    await waitFor(() => expect(window.trifold.joined.stopSearch).toHaveBeenCalledOnce());
  });

  it('lists a found table, asks for a name and joins; the campaign then shows under Playing', async () => {
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Join a campaign' }));
    await waitFor(() => expect(window.trifold.joined.startSearch).toHaveBeenCalled());
    act(() => tablesFound([greyford]));

    await user.click(screen.getByRole('button', { name: 'Join The Lantern at Greyford' }));
    window.trifold.joined.list = vi.fn(async () => [joinedGreyford]);
    await user.type(screen.getByRole('textbox', { name: 'Your name at the table' }), 'Sam');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() =>
      expect(window.trifold.joined.join).toHaveBeenCalledWith({
        campaignId: 'c1',
        campaignName: 'The Lantern at Greyford',
        displayName: 'Sam',
        address: '192.168.1.23:8130',
      }),
    );
    // The panel closes, which ends the search, and the page splits.
    await waitFor(() => expect(screen.queryByTestId('join-campaign')).toBeNull());
    expect(window.trifold.joined.stopSearch).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Playing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Running' })).toBeInTheDocument();
    expect(screen.getByText('Playing as Sam · not at the table yet')).toBeInTheDocument();
  });

  it('says which side must update instead of offering Join, for a table on another protocol', async () => {
    const user = userEvent.setup();
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Join a campaign' }));
    await waitFor(() => expect(window.trifold.joined.startSearch).toHaveBeenCalled());
    act(() => tablesFound([{ ...greyford, update: 'player', appVersion: '9.0.0' }]));
    expect(await screen.findByTestId('join-update')).toHaveTextContent(
      'This table runs a newer Trifold (9.0.0). Update yours to join.',
    );
    expect(screen.queryByRole('button', { name: 'Join The Lantern at Greyford' })).toBeNull();
    act(() => tablesFound([{ ...greyford, update: 'gm' }]));
    expect(await screen.findByTestId('join-update')).toHaveTextContent(
      'Your GM needs to update it before you can join.',
    );
  });

  it('joins by a typed address, and says why when it cannot', async () => {
    const user = userEvent.setup();
    window.trifold.joined.peek = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'address' })
      .mockResolvedValueOnce({ ok: false, reason: 'noAnswer' })
      .mockResolvedValueOnce({ ok: true, table: greyford });
    render(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Join a campaign' }));
    await user.click(screen.getByRole('button', { name: 'Enter an address instead' }));
    const field = screen.getByRole('textbox', { name: 'Table address' });

    await user.type(field, 'example.com{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('not an address on your local');
    await user.clear(field);
    await user.type(field, 'trifold.local{Enter}');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Nothing answered'));
    await user.type(field, '{Enter}');
    expect(await screen.findByText('Join The Lantern at Greyford')).toBeInTheDocument();
    expect(window.trifold.joined.peek).toHaveBeenLastCalledWith('trifold.local');
  });

  it('leaves a campaign only after the inline confirm', async () => {
    const user = userEvent.setup();
    window.trifold.joined.list = vi.fn(async () => [joinedGreyford]);
    render(<CampaignsPage />);
    await user.click(await screen.findByRole('button', { name: 'Leave The Lantern at Greyford…' }));
    expect(window.trifold.joined.leave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(window.trifold.joined.leave).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Leave The Lantern at Greyford…' }));
    window.trifold.joined.list = vi.fn(async () => []);
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(window.trifold.joined.leave).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Playing' })).toBeNull());
  });
});
