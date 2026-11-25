import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CampaignSummary, JoinedSummary } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { defaultLayout } from '../../stores/shellLayout';
import { TopBar } from './TopBar';

/** The top bar's campaign switcher: both kinds of campaign, the most recent few of each. */

const running = (n: number): CampaignSummary[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    slug: `campaign-${i + 1}`,
    name: `Campaign ${i + 1}`,
    pcCount: 0,
    encounterCount: 0,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }));

const playing = (n: number): JoinedSummary[] =>
  Array.from({ length: n }, (_, i) => ({
    campaignId: `j${i + 1}`,
    campaignName: `Table ${i + 1}`,
    displayName: 'Sam',
    characterId: null,
    joinedAt: '2026-11-01T00:00:00.000Z',
    lastLiveAt: null,
    openedAt: null,
    claimed: false,
  }));

function openRunning(summary: CampaignSummary) {
  const bundle = {
    campaign: { id: summary.id, slug: summary.slug, name: summary.name, preferredEdition: '2024' },
    pcs: [],
    adventures: [],
    notes: [],
    npcs: [],
    encounters: [],
    scenes: [],
    counters: [],
    timers: [],
    sessions: [],
  } as unknown as CampaignBundle;
  act(() => {
    useCampaignStore.setState({ current: bundle });
    useShellStore.setState({ space: 'console', role: 'gm', campaignSlug: summary.slug });
  });
}

function setLists(campaigns: CampaignSummary[], joined: JoinedSummary[]) {
  // Opening the switcher reloads the joined list from main.
  window.trifold.joined.list = vi.fn(async () => joined);
  act(() => {
    useCampaignStore.setState({ campaigns });
    useJoinedStore.setState({ joined, current: null });
  });
}

const menu = () => within(screen.getByRole('menu', { name: 'Campaigns' }));
const names = (group: string) =>
  within(menu().getByRole('group', { name: group }))
    .getAllByRole('menuitem')
    .map((b) => b.textContent?.replace('✓', '').trim());

beforeEach(() => {
  useShellStore.setState({
    space: 'library',
    role: 'gm',
    campaignSlug: null,
    joinedId: null,
    layout: defaultLayout(),
    presets: [],
    playerPresets: [],
    pop: null,
  });
  useCampaignStore.setState({ current: null, campaigns: [] });
  useJoinedStore.setState({ joined: [], current: null });
});

describe('TopBar campaign switcher', () => {
  it('lists running and playing campaigns under their own headings', async () => {
    const campaigns = running(2);
    setLists(campaigns, playing(2));
    openRunning(campaigns[0]!);
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Campaign: Campaign 1' }));
    expect(names('Running')).toEqual(['Campaign 1', 'Campaign 2']);
    expect(names('Playing')).toEqual(['Table 1', 'Table 2']);
    expect(menu().getByText('Running')).toBeInTheDocument();
    expect(menu().getByText('Playing')).toBeInTheDocument();
    expect(menu().queryByRole('menuitem', { name: 'More campaigns…' })).toBeNull();
  });

  it('shows no headings when the Library has only one kind', async () => {
    const campaigns = running(2);
    setLists(campaigns, []);
    openRunning(campaigns[0]!);
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Campaign: Campaign 1' }));
    expect(menu().queryByText('Running')).toBeNull();
    expect(menu().queryByRole('group', { name: 'Playing' })).toBeNull();
  });

  it('lists the five most recent of each kind, keeps the open one, and offers the rest', async () => {
    const campaigns = running(8);
    setLists(campaigns, playing(7));
    // The open campaign is the least recent: it still shows, in the last place.
    openRunning(campaigns[7]!);
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Campaign: Campaign 8' }));
    expect(names('Running')).toEqual([
      'Campaign 1',
      'Campaign 2',
      'Campaign 3',
      'Campaign 4',
      'Campaign 8',
    ]);
    expect(names('Playing')).toEqual(['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5']);
    await userEvent.click(menu().getByRole('menuitem', { name: 'More campaigns…' }));
    expect(useShellStore.getState()).toMatchObject({ space: 'library', libraryPage: 'campaigns' });
  });

  it('gives a joined campaign the same bar: the switcher, Layouts and Settings, no Hotkeys', async () => {
    const joined = playing(2);
    setLists(running(1), joined);
    act(() => {
      useJoinedStore.setState({ current: joined[1]! });
      useShellStore.setState({ space: 'console', role: 'player', joinedId: 'j2' });
    });
    render(<TopBar />);
    expect(screen.getByTestId('joined-crumb')).toHaveTextContent('Table 2');
    expect(screen.getByRole('button', { name: 'Layouts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hotkeys' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Campaign: Table 2' }));
    expect(menu().getByRole('menuitem', { name: 'Join a campaign…' })).toBeInTheDocument();
    expect(menu().queryByRole('menuitem', { name: 'New campaign…' })).toBeNull();
  });
});
