import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Encounter, PCCard, Scene, Token } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { MapEditor } from './MapEditor';

const now = '2026-09-28T00:00:00.000Z';

const ambush: Encounter = {
  schemaVersion: 1,
  id: 'e1',
  name: 'Bridge ambush',
  combatants: [
    {
      id: 't1',
      ref: { kind: 'custom', name: 'Bandit' },
      quantity: 2,
      role: 'enemy',
      hidden: false,
      cache: { xp: 25, cr: '1/8', type: 'humanoid', hp: 11, ac: 12 },
    },
  ],
  notes: '',
  state: null,
  results: [],
  createdAt: now,
  updatedAt: now,
};

const wolf: Token = {
  id: 'wolf',
  kind: 'creature',
  ref: { kind: 'custom', name: 'Wolf' },
  label: 'Wolf',
  x: 1,
  y: 1,
  footprint: 1,
  role: 'enemy',
  hidden: false,
  nameMasked: true,
  dead: false,
};

const blank: Scene = {
  schemaVersion: 1,
  id: 's1',
  kind: 'blankGrid',
  title: 'Old bridge',
  subtitle: '',
  showTitleOverride: null,
  parentId: null,
  order: 0,
  notes: '',
  blank: { cols: 20, rows: 12 },
  tokens: [wolf],
  entryMarkers: [],
  playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  createdAt: now,
  updatedAt: now,
};

let latest: Scene = blank;
function Harness({ initial = blank }: { initial?: Scene }) {
  const [scene, setScene] = useState(initial);
  latest = scene;
  return (
    <MapEditor
      scene={scene}
      slug="sunken-keep"
      onChange={(next) => {
        latest = next;
        setScene(next);
      }}
    />
  );
}

describe('MapEditor: place encounter', () => {
  beforeEach(() => {
    latest = blank;
    useCampaignStore.setState({
      current: {
        campaign: { settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        encounters: [ambush],
        scenes: [blank],
      } as unknown as CampaignBundle,
    });
    useCombatStore.setState({ encounterId: null, state: null });
  });

  it('drops hidden tokens, links the encounter, and starts it with the loose tokens too', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Place encounter…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Place Bridge ambush' }));

    await waitFor(() => expect(latest.encounterId).toBe('e1'));
    const placed = latest.tokens.filter((t) => t.id !== 'wolf');
    expect(placed.map((t) => t.label)).toEqual(['Bandit 1', 'Bandit 2']);
    expect(placed.every((t) => t.hidden && t.maskedLabel === 'Humanoid')).toBe(true);
    expect(new Set(placed.map((t) => `${t.x},${t.y}`)).size).toBe(2);
    const linked = useCampaignStore.getState().current!.encounters[0]!;
    expect(linked.sceneId).toBe('s1');
    expect(linked.combatants[0]!.tokenIds).toEqual(placed.map((t) => t.id));

    await userEvent.click(screen.getByRole('button', { name: 'Reveal creatures (2)' }));
    expect(latest.tokens.every((t) => !t.hidden)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Start linked encounter' }));
    await waitFor(() => expect(useCombatStore.getState().encounterId).toBe('e1'));
    const fighters = useCombatStore.getState().state!.combatants;
    expect(fighters.map((c) => c.tokenId).sort()).toEqual(
      [...placed.map((t) => t.id), 'wolf'].sort(),
    );
  });
});

describe('MapEditor: tools and selection', () => {
  const pc = (id: string, name: string) => ({ id, name }) as unknown as PCCard;

  beforeEach(() => {
    latest = blank;
    useCampaignStore.setState({
      current: {
        campaign: { settings: { initiativeMode: 'perGroup' } },
        pcs: [pc('p1', 'Thora'), pc('p2', 'Bram')],
        encounters: [],
        scenes: [blank],
      } as unknown as CampaignBundle,
    });
    useCombatStore.setState({ encounterId: null, state: null });
  });

  it('places one player character, and placing them again moves them', async () => {
    render(<Harness />);
    const canvas = screen.getByTestId('map-canvas');
    await userEvent.click(screen.getByRole('button', { name: 'Add player characters' }));
    await userEvent.click(screen.getByRole('button', { name: 'Place Bram' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(canvas);
    const pcs = () => latest.tokens.filter((t) => t.kind === 'pc');
    expect(pcs().map((t) => t.label)).toEqual(['Bram']);
    expect(screen.getByTestId('token-inspector')).toHaveTextContent('Player character');

    await userEvent.click(screen.getByRole('button', { name: 'Add player characters' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move Bram' }));
    await userEvent.click(canvas);
    expect(pcs()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Remove party' }));
    expect(pcs()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Remove party' })).toBeDisabled();
  });

  it('selects an entry marker to rename it and place the party there', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add entry marker' }));
    await userEvent.click(screen.getByTestId('map-canvas'));
    expect(latest.entryMarkers).toHaveLength(1);

    const inspector = screen.getByTestId('entry-inspector');
    const name = within(inspector).getByRole('textbox');
    await userEvent.clear(name);
    await userEvent.type(name, 'Gate');
    expect(latest.entryMarkers[0]!.name).toBe('Gate');

    await userEvent.click(within(inspector).getByRole('button', { name: 'Place party here' }));
    expect(latest.tokens.filter((t) => t.kind === 'pc')).toHaveLength(2);

    await userEvent.click(within(inspector).getByRole('button', { name: 'Remove entry marker' }));
    expect(latest.entryMarkers).toHaveLength(0);
    expect(screen.queryByTestId('entry-inspector')).toBeNull();
  });

  it('keeps grid settings in the grid pop-up, which closes on Escape', async () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Cell px')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));
    const pop = screen.getByRole('dialog', { name: 'Grid settings' });
    expect(within(pop).getByLabelText('Columns')).toHaveValue(20);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('MapEditor: backgrounds', () => {
  const day = { path: 'images/day.png', displayPath: 'images/day.jpg', width: 1400, height: 1000 };
  const night = { ...day, path: 'images/night.png', displayPath: 'images/night.jpg' };
  const mill: Scene = {
    ...blank,
    kind: 'map',
    title: 'Old mill',
    image: day,
    grid: {
      cellPx: 70,
      offsetX: 0,
      offsetY: 0,
      color: '#000000',
      opacity: 0.3,
      showToPlayers: true,
    },
  };

  beforeEach(() => {
    latest = mill;
    useCampaignStore.setState({
      current: {
        campaign: { settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        encounters: [],
        scenes: [mill],
      } as unknown as CampaignBundle,
      importSceneImage: async () => night,
    });
    useCombatStore.setState({ encounterId: null, state: null });
  });

  it('adds a background, shows it, and keeps the tokens where they were', async () => {
    render(<Harness initial={mill} />);
    await userEvent.click(screen.getByRole('button', { name: 'Backgrounds' }));
    const pop = screen.getByRole('dialog', { name: 'Backgrounds' });
    expect(within(pop).getByRole('button', { name: 'Showing Original' })).toBeDisabled();

    await userEvent.click(within(pop).getByRole('button', { name: 'Add background…' }));
    await waitFor(() => expect(latest.backgrounds).toHaveLength(2));
    expect(latest.image).toEqual(day);

    const name = within(pop).getByLabelText('Background 2 name');
    fireEvent.change(name, { target: { value: 'Night' } });
    await userEvent.click(within(pop).getByRole('button', { name: 'Show Night' }));
    expect(latest.image).toEqual(night);
    expect(latest.tokens).toEqual(mill.tokens);
    expect(within(pop).getByRole('button', { name: 'Remove Night' })).toBeEnabled();
  });

  it('has no Backgrounds tool on a blank grid', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Backgrounds' })).toBeNull();
  });
});

describe('MapEditor: replacing a background', () => {
  it('replaces the showing background’s image and keeps its name', async () => {
    const day = {
      path: 'images/day.png',
      displayPath: 'images/day.jpg',
      width: 1400,
      height: 1000,
    };
    const dusk = { ...day, path: 'images/dusk.png', displayPath: 'images/dusk.jpg' };
    const mill: Scene = { ...blank, kind: 'map', title: 'Old mill', image: day };
    latest = mill;
    useCampaignStore.setState({
      current: {
        campaign: { settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        encounters: [],
        scenes: [mill],
      } as unknown as CampaignBundle,
      importSceneImage: async () => dusk,
    });
    render(<Harness initial={mill} />);
    await userEvent.click(screen.getByRole('button', { name: 'Backgrounds' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace Original image' }));
    await waitFor(() => expect(latest.image).toEqual(dusk));
    expect(latest.backgrounds).toEqual([{ id: 'original', name: 'Original', image: dusk }]);
  });
});
