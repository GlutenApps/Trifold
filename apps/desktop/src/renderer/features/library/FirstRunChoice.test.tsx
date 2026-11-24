import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { LibraryView } from './LibraryView';

/** The first-run choice (ADR 0077). */

const info = (extra: object = {}) => ({
  version: '0.7.0',
  electron: '',
  chrome: '',
  node: '',
  platform: 'win32',
  userDataPath: '',
  ...extra,
});
const library = (needsRole: boolean, role: 'gm' | 'player' | null = null) => ({
  path: 'C:/test/Library',
  ok: true,
  error: null,
  settings: { ...defaultLibrarySettings(), role },
  index: { ok: true, version: 1, error: null },
  ...(needsRole ? { needsRole: true } : {}),
});

beforeEach(() => {
  useJoinedStore.setState({ joined: [], tables: [], wantsJoin: false });
  // Start where a new Library starts, on Campaigns, as the app does.
  useShellStore.getState().setLibraryPage('campaigns');
  window.trifold.joined.startSearch = vi.fn(async () => []);
  window.trifold.joined.stopSearch = vi.fn(async () => undefined);
});

describe('FirstRunChoice', () => {
  it('asks a new Library first; Player opens Campaigns with Join a campaign, and no sample', async () => {
    useAppStore.setState({ info: info() as never, library: library(true) as never });
    const user = userEvent.setup();
    render(<LibraryView />);
    expect(screen.getByTestId('first-run')).toHaveTextContent('How will you use Trifold?');
    await user.click(screen.getByRole('button', { name: /^Player/ }));
    expect(window.trifold.library.setRole).toHaveBeenCalledWith('player');
    expect(await screen.findByTestId('join-campaign')).toBeInTheDocument();
    // A player's Library leads with Join a campaign.
    expect(screen.getByRole('button', { name: 'Join a campaign' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'Create campaign' })).not.toHaveClass('primary');
  });

  it('Game master gets the sample campaign, through main', async () => {
    useAppStore.setState({ info: info() as never, library: library(true) as never });
    const user = userEvent.setup();
    render(<LibraryView />);
    await user.click(screen.getByRole('button', { name: /^Game master/ }));
    expect(window.trifold.library.setRole).toHaveBeenCalledWith('gm');
    await waitFor(() => expect(screen.queryByTestId('first-run')).toBeNull());
    expect(screen.getByRole('button', { name: 'Create campaign' })).toHaveClass('primary');
  });

  it('does not ask a Library that is not new', () => {
    useAppStore.setState({ info: info() as never, library: library(false) as never });
    render(<LibraryView />);
    expect(screen.queryByTestId('first-run')).toBeNull();
  });
});
