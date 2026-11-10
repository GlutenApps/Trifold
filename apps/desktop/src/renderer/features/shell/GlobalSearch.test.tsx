import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CompendiumSuggestion } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useSearchStore } from '../../stores/searchStore';
import { defaultLayout } from '../../stores/shellLayout';
import { useShellStore } from '../../stores/shellStore';
import { useNavStore } from '../../navigate';
import { AppShell } from './AppShell';

const now = '2026-11-09T00:00:00.000Z';

function bundle(): CampaignBundle {
  return {
    campaign: {
      schemaVersion: 1,
      id: 'c1',
      slug: 'greyford',
      name: 'Greyford',
      preferredEdition: '2024',
      settings: {},
      createdAt: now,
      updatedAt: now,
    },
    pcs: [],
    adventures: [],
    notes: [
      {
        schemaVersion: 1,
        id: 'n1',
        kind: 'note',
        title: 'Hesper’s letter',
        body: 'Dear reader',
        tags: [],
        links: [],
        parentId: null,
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    npcs: [
      {
        schemaVersion: 1,
        id: 'npc1',
        name: 'Hesper',
        role: 'Innkeeper',
        location: '',
        notes: '',
        isAlive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    encounters: [],
    scenes: [],
    counters: [],
    timers: [],
  } as unknown as CampaignBundle;
}

function openCampaign() {
  const summary = {
    id: 'c1',
    slug: 'greyford',
    name: 'Greyford',
    pcCount: 0,
    encounterCount: 0,
    updatedAt: now,
  } as never;
  window.trifold.campaigns.current = vi.fn(async () => bundle());
  window.trifold.campaigns.list = vi.fn(async () => [summary]);
  act(() => {
    useCampaignStore.setState({ current: bundle(), campaigns: [summary] });
  });
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    useShellStore.setState({
      space: 'library',
      campaignSlug: null,
      layout: defaultLayout(),
      focusedGroup: 0,
      presets: [],
      consoles: {},
      flyout: null,
      pop: null,
      viewportWidth: 1600,
      hydratedFor: null,
    });
    useCampaignStore.setState({ current: null, campaigns: [] });
    useAppStore.setState({ library: null });
    useNavStore.setState({ pending: null });
    useSearchStore.getState().clear();
  });

  it('Ctrl+F focuses the field; typing lists grouped results that Enter opens through a deep link', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(useShellStore.getState().hydratedFor).not.toBeNull());
    const field = screen.getByRole('combobox', { name: 'Search the campaign and compendium' });
    await userEvent.keyboard('{Control>}f{/Control}');
    expect(field).toHaveFocus();

    await userEvent.keyboard('hesp');
    const results = await screen.findByTestId('search-results');
    expect(within(results).getByRole('group', { name: 'Notes' })).toHaveTextContent(
      'Hesper’s letter',
    );
    expect(within(results).getByRole('group', { name: 'NPCs' })).toHaveTextContent('Hesper');
    // The first row is active; the arrow moves to the NPC.
    const rows = within(results).getAllByRole('option');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', rows[1]!.id);

    await userEvent.keyboard('{Enter}');
    // The pop-up closes, the Campaign tab shows the NPCs sub-tab and the row is marked.
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument();
    const campaign = screen.getByRole('tabpanel', { name: 'Campaign' });
    expect(within(campaign).getByRole('tab', { name: /NPCs/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() =>
      expect(within(campaign).getByTestId('npc-row')).toHaveAttribute('data-nav', 'npc:npc1'),
    );
    expect(useNavStore.getState().pending).toBeNull();
    // The query stays for a second look; Escape clears it.
    expect(field).toHaveValue('hesp');
    field.focus();
    await userEvent.keyboard('{Escape}');
    expect(field).toHaveValue('');
  });

  it('lists a phrase found inside a note with a snippet and opens the note at it', async () => {
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(useShellStore.getState().hydratedFor).not.toBeNull());
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Search the campaign and compendium' }),
    );
    await userEvent.keyboard('dear');
    const results = await screen.findByTestId('search-results');
    const mentions = within(results).getByRole('group', { name: 'Mentioned in' });
    const row = within(mentions).getByRole('option');
    expect(row).toHaveTextContent('Hesper’s letter');
    expect(row.querySelector('mark')).toHaveTextContent('Dear');
    await userEvent.keyboard('{Enter}');
    // The Notes panel opens the note with the phrase found in it.
    const campaign = screen.getByRole('tabpanel', { name: 'Campaign' });
    await waitFor(() =>
      expect(within(campaign).getByTestId('note-pane')).toHaveAttribute('data-nav', 'note:n1'),
    );
    expect(within(campaign).getByLabelText('Find in notes')).toHaveValue('dear');
    expect(useNavStore.getState().pending).toBeNull();
  });

  it('Show all lists one type in full; Escape goes back before it clears', async () => {
    const crowd = bundle();
    crowd.npcs = Array.from({ length: 8 }, (_, i) => ({
      ...crowd.npcs[0]!,
      id: `npc${i}`,
      name: `Hesper ${i}`,
    }));
    window.trifold.campaigns.current = vi.fn(async () => crowd);
    render(<AppShell />);
    act(() => {
      useCampaignStore.setState({ current: crowd, campaigns: [] });
    });
    await waitFor(() => expect(useShellStore.getState().hydratedFor).not.toBeNull());
    const field = screen.getByRole('combobox', { name: 'Search the campaign and compendium' });
    await userEvent.click(field);
    await userEvent.keyboard('hesper');
    const results = await screen.findByTestId('search-results');
    const npcs = within(results).getByRole('group', { name: 'NPCs' });
    expect(within(npcs).getAllByRole('option')).toHaveLength(6);
    await userEvent.click(within(npcs).getByRole('button', { name: 'Show all NPCs' }));
    // Only the NPCs remain, all eight, and the cursor stays in the field.
    expect(
      within(results)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['NPCs']);
    expect(within(results).getAllByRole('option')).toHaveLength(8);
    expect(field).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(within(results).getByRole('group', { name: 'Notes' })).toBeInTheDocument();
    expect(field).toHaveValue('hesper');
    await userEvent.keyboard('{Escape}');
    expect(field).toHaveValue('');
  });

  it('asks the compendium once the typing pauses and lists its hits last', async () => {
    const hit: CompendiumSuggestion = {
      id: 'r1',
      kind: 'monster',
      key: 'hezrou',
      name: 'Hezrou',
      displayName: 'Hezrou',
      sourceId: 'srd',
      sourceName: 'SRD',
      edition: '2024',
      editions: ['2024'],
      cr: '8',
      type: 'fiend',
      size: 'L',
      environment: null,
      isNpc: false,
      level: null,
      typeCode: null,
      rarity: null,
      tier: 'prefix',
    };
    window.trifold.compendium.suggest = vi.fn(async () => [hit]);
    render(<AppShell />);
    openCampaign();
    await waitFor(() => expect(useShellStore.getState().hydratedFor).not.toBeNull());
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Search the campaign and compendium' }),
    );
    await userEvent.keyboard('hez');
    const results = await screen.findByTestId('search-results');
    const compendium = await within(results).findByRole('group', { name: 'Compendium' });
    expect(compendium).toHaveTextContent('Hezrou');
    expect(compendium).toHaveTextContent('Monster · CR 8 · SRD');
    await userEvent.click(within(compendium).getByRole('option'));
    // The Compendium tab took the link at once (it is mounted) and fetched the record.
    expect(useNavStore.getState().pending).toBeNull();
    expect(window.trifold.compendium.get).toHaveBeenCalledWith('r1');
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument();
  });
});
