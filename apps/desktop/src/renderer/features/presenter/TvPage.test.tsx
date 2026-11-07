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
      state: initialPresenterState,
      history: [],
      recent: [],
      liveOverride: null,
      liveSource: null,
    });
  });

  it('offers the way in when nothing is selected or live', () => {
    render(<TvPage />);
    // The player starts black, but with nothing sent that is "Nothing live", not a blackout.
    expect(screen.getByTestId('tv-status')).toHaveTextContent('Nothing live');
    expect(screen.getByRole('button', { name: 'Blackout the TV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Scenes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to TV' })).toBeDisabled();
  });

  it('previews a selected title card and sends it from the header', async () => {
    useSceneStore.getState().select('card');
    render(<TvPage />);
    const preview = screen.getByTestId('tv-preview');
    expect(preview).toHaveClass('backdrop-stone');
    expect(within(preview).getByText('Session 4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send to TV' }));
    expect(usePresenterStore.getState().state.scene?.id).toBe('card');
    expect(screen.getByText('live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to TV' })).toBeDisabled();
  });

  it('shows the live scene when nothing is selected, and names it when another is', async () => {
    useSceneStore.getState().send(card);
    render(<TvPage />);
    expect(screen.getByTestId('tv-title')).toHaveTextContent('The Sunken Keep');
    expect(screen.getByText('live')).toBeInTheDocument();

    useSceneStore.getState().select('grid');
    const liveLink = await screen.findByRole('button', { name: 'Live: The Sunken Keep' });
    expect(screen.getByTestId('tv-title')).toHaveTextContent('Old bridge');

    await userEvent.click(liveLink);
    expect(useSceneStore.getState().selectedId).toBe('card');
  });

  it('carries blackout, the break screen and overlays itself, not only on the strip', async () => {
    useSceneStore.getState().send(card);
    render(<TvPage />);
    const show = screen.getByRole('group', { name: 'Show on the TV' });
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

  it('opens the TV first and lights the on-air tally while it is open', async () => {
    useAppStore.setState({ playerOpen: false });
    render(<TvPage />);
    const open = screen.getByRole('button', { name: 'Open TV' });
    expect(open).toHaveAttribute('aria-pressed', 'false');
    expect(open).not.toHaveClass('tally');

    await userEvent.click(open);
    const on = await screen.findByRole('button', { name: 'TV on' });
    expect(useAppStore.getState().playerOpen).toBe(true);
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on).toHaveClass('tally');

    await userEvent.click(on);
    await screen.findByRole('button', { name: 'Open TV' });
    expect(useAppStore.getState().playerOpen).toBe(false);
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
