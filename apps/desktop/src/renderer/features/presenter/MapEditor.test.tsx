import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Combatant, Encounter, PCCard, Scene, Token } from '@trifold/schema';
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

  it('keeps grid settings in the grid pop-up, which closes on Escape', async () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Cell px')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));
    const pop = screen.getByRole('dialog', { name: 'Grid settings' });
    expect(within(pop).getByLabelText('Columns')).toHaveValue(20);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aligns the grid from a block of cells and previews the block between the clicks', async () => {
    const { container } = render(<Harness />);
    const canvas = screen.getByTestId('map-canvas');
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));
    const pop = screen.getByRole('dialog', { name: 'Grid settings' });
    const cells = within(pop).getByLabelText('Cells across');
    expect(cells).toHaveValue(1);
    fireEvent.change(cells, { target: { value: '10' } });
    expect(cells).toHaveValue(10);
    await userEvent.click(within(pop).getByRole('button', { name: 'Align grid to map' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Click one corner of a block of 10×10 cells',
    );

    // The DM camera is 0.25 zoom at the origin in jsdom, so client px × 4 = map px.
    fireEvent.pointerDown(canvas, { button: 0, clientX: 12, clientY: 12 });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Now click the opposite corner of that block',
    );
    expect(container.querySelector('.align-preview')).toBeNull();
    fireEvent.pointerMove(canvas, { clientX: 62, clientY: 62 });
    const preview = container.querySelector('.align-preview');
    expect(preview).not.toBeNull();
    expect(preview).toHaveAttribute('width', '200');

    fireEvent.pointerDown(canvas, { button: 0, clientX: 112, clientY: 112 });
    expect(latest.grid).toMatchObject({ cellPx: 40, offsetX: 8, offsetY: 8 });
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.align-preview')).toBeNull();
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

describe('MapEditor: the fight on the map (ADR 0012)', () => {
  const fighter = (id: string, name: string, extra: Partial<Combatant> = {}): Combatant => ({
    id,
    name,
    maskedName: name,
    revealed: true,
    ref: { kind: 'custom', name },
    role: 'enemy',
    initiative: 10,
    initiativeBonus: 0,
    dexterity: 10,
    hp: { current: 10, max: 10, temp: 0 },
    saves: {},
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    conditions: [],
    concentrating: null,
    counters: [],
    recharges: [],
    deathSaves: null,
    dead: false,
    hidden: false,
    held: false,
    isLair: false,
    ...extra,
  });
  const goblin: Token = {
    ...wolf,
    id: 'gob',
    ref: { kind: 'custom', name: 'Goblin' },
    label: 'Goblin',
    x: 4,
  };
  const withGoblin: Scene = { ...blank, tokens: [wolf, goblin] };

  beforeEach(() => {
    latest = withGoblin;
    useCampaignStore.setState({
      current: {
        campaign: { settings: { initiativeMode: 'perGroup' } },
        pcs: [],
        npcs: [],
        encounters: [{ ...ambush, sceneId: 's1' }],
        scenes: [withGoblin],
      } as unknown as CampaignBundle,
    });
    useCombatStore.setState({
      encounterId: 'e1',
      state: {
        round: 1,
        turnIndex: 0,
        combatants: [fighter('b', 'Bandit 1', { tokenId: 'elsewhere' }), fighter('w', 'Wolf')],
        log: [],
        startedAt: now,
      },
    });
  });

  it('ties the matching token on its own, numbers it, and lets a stranger join', async () => {
    render(<Harness initial={withGoblin} />);
    // Wolf finds its token without being asked; the goblin has no one to be.
    await waitFor(() =>
      expect(useCombatStore.getState().state!.combatants[1]!.tokenId).toBe('wolf'),
    );
    expect(screen.getByTestId('token-order')).toHaveTextContent('2');
    // The goblin wears a question mark instead of a place; nothing on the token itself links it.
    expect(screen.getByRole('img', { name: 'Goblin is not in the fight' })).toHaveTextContent('?');
    expect(screen.queryByRole('img', { name: 'Wolf is not in the fight' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /to the fight/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getAllByTestId('console-token')[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Link Goblin to the fight' }));
    await waitFor(() =>
      expect(useCombatStore.getState().state!.combatants.map((c) => c.name)).toEqual([
        'Bandit 1',
        'Wolf',
        'Goblin',
      ]),
    );
    expect(useCombatStore.getState().state!.combatants[2]!.tokenId).toBe('gob');
    expect(screen.queryByTestId('token-unlinked')).not.toBeInTheDocument();
  });

  it('links the selected token from the inspector, asking when several fighters could be it', async () => {
    useCombatStore.setState({
      encounterId: 'e1',
      state: {
        round: 1,
        turnIndex: 0,
        combatants: [
          fighter('b', 'Bandit 1', { tokenId: 'elsewhere' }),
          fighter('w1', 'Wolf 1', { ref: { kind: 'custom', name: 'Wolf' } }),
          fighter('w2', 'Wolf 2', { ref: { kind: 'custom', name: 'Wolf' } }),
        ],
        log: [],
        startedAt: now,
      },
    });
    render(<Harness initial={withGoblin} />);
    const tokens = screen.getAllByTestId('console-token');
    // Two wolves could be the one wolf token, so nothing was linked on its own.
    expect(useCombatStore.getState().state!.combatants.every((c) => c.tokenId !== 'wolf')).toBe(
      true,
    );
    fireEvent.contextMenu(tokens[0]!);
    const inspector = screen.getByTestId('token-inspector');
    await userEvent.click(
      within(inspector).getByRole('button', { name: 'Link Wolf to the fight' }),
    );
    const which = within(inspector).getByRole('group', { name: 'Which combatant' });
    expect(which).toHaveTextContent('Which combatant is Wolf?');
    await userEvent.click(within(which).getByRole('button', { name: 'Wolf 2' }));
    expect(useCombatStore.getState().state!.combatants[2]!.tokenId).toBe('wolf');
    expect(within(inspector).queryByRole('group', { name: 'Which combatant' })).toBeNull();
    expect(inspector).toHaveTextContent('In the fight as Wolf 2');
    expect(within(inspector).queryByRole('button', { name: 'Link Wolf to the fight' })).toBeNull();
    expect(within(inspector).getByRole('button', { name: 'Unlink from Wolf 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The same toolbar as the tracker's: hidden and dead go through the fighter, which the
    // map's own copy of the token then follows.
    const hide = within(inspector).getByRole('button', { name: 'Hide from players' });
    expect(hide).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(hide);
    expect(useCombatStore.getState().state!.combatants[2]!.hidden).toBe(true);
    await userEvent.click(within(inspector).getByRole('button', { name: 'Mark dead' }));
    expect(useCombatStore.getState().state!.combatants[2]!.dead).toBe(true);
    await waitFor(() =>
      expect(useCampaignStore.getState().current!.scenes[0]!.tokens[0]).toMatchObject({
        hidden: true,
        dead: true,
      }),
    );
    await userEvent.click(within(inspector).getByRole('button', { name: 'Reveal name' }));
    expect(latest.tokens[0]!.nameMasked).toBe(false);
    expect(within(inspector).getByRole('button', { name: 'Mask name' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // The goblin matches no one, so Link adds it as a newcomer.
    fireEvent.contextMenu(tokens[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Link Goblin to the fight' }));
    await waitFor(() =>
      expect(useCombatStore.getState().state!.combatants.map((c) => c.name)).toEqual([
        'Bandit 1',
        'Wolf 1',
        'Wolf 2',
        'Goblin',
      ]),
    );
    expect(useCombatStore.getState().state!.combatants[3]!.tokenId).toBe('gob');
  });

  it('hides and kills a token in the fight through its combatant', async () => {
    render(<Harness initial={withGoblin} />);
    await waitFor(() =>
      expect(useCombatStore.getState().state!.combatants[1]!.tokenId).toBe('wolf'),
    );
    const tokens = screen.getAllByTestId('console-token');
    fireEvent.contextMenu(tokens[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Hide from players' }));
    expect(useCombatStore.getState().state!.combatants[1]!.hidden).toBe(true);
    fireEvent.contextMenu(tokens[0]!);
    expect(screen.getByRole('menuitem', { name: 'Unlink from Wolf' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark dead' }));
    expect(useCombatStore.getState().state!.combatants[1]!.dead).toBe(true);
    // The map's own copy of the token followed.
    await waitFor(() =>
      expect(useCampaignStore.getState().current!.scenes[0]!.tokens[0]).toMatchObject({
        hidden: true,
        dead: true,
      }),
    );
  });
});
