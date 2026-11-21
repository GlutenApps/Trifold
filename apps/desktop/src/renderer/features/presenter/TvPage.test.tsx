import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialPresenterState, type CampaignBundle } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { TvPage } from './TvPage';

const now = '2026-11-06T00:00:00.000Z';

const card: Scene = {
  schemaVersion: 1,
  id: 'card',
  kind: 'title',
  title: 'The Sunken Keep',
  subtitle: 'Session 4',
  showTitleOverride: null,
  parentId: null,
  order: 0,
  notes: '',
  backdrop: 'stone',
  tokens: [],
  entryMarkers: [],
  playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  createdAt: now,
  updatedAt: now,
};

const grid: Scene = {
  ...card,
  id: 'grid',
  kind: 'blankGrid',
  title: 'Old bridge',
  subtitle: '',
  blank: { cols: 20, rows: 12 },
};

function seed(scenes: Scene[]) {
  useCampaignStore.setState({
    current: {
      campaign: { slug: 'sunken-keep', settings: { initiativeMode: 'perGroup' } },
      pcs: [],
      encounters: [],
      scenes,
    } as unknown as CampaignBundle,
  });
}

describe('TvPage: the screen', () => {
  beforeEach(() => {
    seed([card, grid]);
    useSceneStore.getState().reset();
    usePresenterStore.setState({
      // Live unless a test says otherwise; ADR 0046's not-live state has its own test.
      state: { ...initialPresenterState, live: true },
      history: [],
      recent: [],
      liveOverride: null,
      liveSource: null,
    });
  });

  it('offers the way in when nothing is selected or active', () => {
    render(<TvPage />);
    // The player starts black, but with nothing set that is "No active scene", not a blackout.
    expect(screen.getByTestId('tv-status')).toHaveTextContent('No active scene');
    expect(screen.getByRole('button', { name: 'Blackout the TV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Scenes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set active scene' })).toBeDisabled();
  });

  it('previews a selected title card and sends it from the header', async () => {
    useSceneStore.getState().select('card');
    render(<TvPage />);
    const preview = screen.getByTestId('tv-preview');
    expect(preview).toHaveClass('backdrop-stone');
    expect(within(preview).getByText('Session 4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Set active scene' }));
    expect(usePresenterStore.getState().state.scene?.id).toBe('card');
    expect(screen.getByText('live')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set active scene' })).not.toBeInTheDocument();
  });

  it('takes the live scene off the TV, leaves the overlays alone, and undoes it', async () => {
    useSceneStore.getState().select('card');
    render(<TvPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Set active scene' }));
    usePresenterStore.getState().setOverlay('initiativeStrip', true);
    usePresenterStore.getState().setBlackout(true);

    await userEvent.click(screen.getByRole('button', { name: 'Clear active scene' }));
    const after = usePresenterStore.getState().state;
    expect(after.scene).toBeNull();
    expect(after.blackout).toBe(false);
    expect(after.overlays.initiativeStrip).toBe(true);
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set active scene' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Undo the last scene' }));
    expect(usePresenterStore.getState().state.scene?.id).toBe('card');
    expect(usePresenterStore.getState().state.blackout).toBe(false);
  });

  it('shows the live scene when nothing is selected, and names it when another is', async () => {
    useSceneStore.getState().send(card);
    render(<TvPage />);
    expect(screen.getByTestId('tv-title')).toHaveTextContent('The Sunken Keep');
    expect(screen.getByText('live')).toBeInTheDocument();

    useSceneStore.getState().select('grid');
    const liveLink = await screen.findByRole('button', { name: 'Active: The Sunken Keep' });
    expect(screen.getByTestId('tv-title')).toHaveTextContent('Old bridge');

    await userEvent.click(liveLink);
    expect(useSceneStore.getState().selectedId).toBe('card');
  });

  it('carries blackout, the break screen and overlays itself, not only on the strip', async () => {
    useSceneStore.getState().send(card);
    render(<TvPage />);
    const show = screen.getByRole('group', { name: 'Active scene' });
    const tools = screen.getByRole('group', { name: 'TV tools' });

    await userEvent.click(within(show).getByRole('button', { name: 'Blackout the TV' }));
    expect(usePresenterStore.getState().state.blackout).toBe(true);
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    await userEvent.click(within(show).getByRole('button', { name: 'Blackout the TV' }));

    // Break is something to show, so it sits with Send and Blackout and flips to End break.
    await userEvent.click(within(show).getByRole('button', { name: 'Break…' }));
    await userEvent.clear(screen.getByLabelText('Break title'));
    await userEvent.type(screen.getByLabelText('Break title'), 'Snacks');
    await userEvent.click(screen.getByRole('button', { name: 'Show break screen' }));
    expect(usePresenterStore.getState().state.breakScreen).toMatchObject({ title: 'Snacks' });
    await userEvent.click(within(show).getByRole('button', { name: 'End break' }));
    expect(usePresenterStore.getState().state.breakScreen).toBeNull();

    await userEvent.click(within(tools).getByRole('button', { name: 'Overlays' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'PC health bars' }));
    expect(usePresenterStore.getState().state.overlays.pcHealthBars).toBe(true);

    // Handouts are parked: no control in the console for now.
    expect(screen.queryByRole('button', { name: 'Handout' })).not.toBeInTheDocument();
  });

  it('goes live, opening the TV, and lights the on-air tally until it ends (ADR 0046)', async () => {
    usePresenterStore.setState({ state: initialPresenterState });
    useAppStore.setState({ playerOpen: false });
    render(<TvPage />);
    expect(screen.getByTestId('tv-status')).toHaveTextContent('Not live');
    const go = screen.getByRole('button', { name: 'Go live' });
    expect(go).toHaveAttribute('aria-pressed', 'false');
    expect(go).not.toHaveClass('tally');

    await userEvent.click(go);
    const end = await screen.findByRole('button', { name: 'End live' });
    expect(usePresenterStore.getState().state.live).toBe(true);
    expect(window.trifold.player.openForLive).toHaveBeenCalled();
    expect(useAppStore.getState().playerOpen).toBe(true);
    expect(end).toHaveAttribute('aria-pressed', 'true');
    expect(end).toHaveClass('tally');

    await userEvent.click(end);
    await screen.findByRole('button', { name: 'Go live' });
    expect(usePresenterStore.getState().state.live).toBe(false);
    expect(useAppStore.getState().playerOpen).toBe(false);
  });

  it('sets the active scene before going live, and shows it when the DM goes live', async () => {
    usePresenterStore.setState({ state: initialPresenterState });
    useSceneStore.getState().select('card');
    render(<TvPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Set active scene' }));
    expect(usePresenterStore.getState().state.scene?.id).toBe('card');
    // Active, not on air: the badge says so until Go live.
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Go live' }));
    expect(await screen.findByText('live')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('steps between prepared scenes and jumps from the list without sending', async () => {
    useSceneStore.getState().send(card);
    useSceneStore.getState().select('card');
    render(<TvPage />);
    const picker = screen.getByRole('group', { name: 'Scene' });
    expect(within(picker).getByRole('button', { name: 'Previous scene' })).toBeDisabled();

    await userEvent.click(within(picker).getByRole('button', { name: 'Next scene' }));
    expect(useSceneStore.getState().selectedId).toBe('grid');
    expect(screen.getByTestId('tv-title')).toHaveTextContent('Old bridge');
    expect(within(picker).getByRole('button', { name: 'Next scene' })).toBeDisabled();
    // Stepping selects only; the title card is still the one on the TV.
    expect(usePresenterStore.getState().state.scene?.id).toBe('card');

    await userEvent.click(screen.getByRole('button', { name: /Old bridge/ }));
    const list = screen.getByRole('listbox', { name: 'Scenes' });
    const option = within(list).getByRole('option', { name: /The Sunken Keep/ });
    expect(within(option).getByText('live')).toBeInTheDocument();
    await userEvent.click(option);
    expect(useSceneStore.getState().selectedId).toBe('card');
    expect(screen.queryByRole('listbox', { name: 'Scenes' })).not.toBeInTheDocument();
  });
});
