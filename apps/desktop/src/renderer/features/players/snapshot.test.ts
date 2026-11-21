import { describe, expect, it } from 'vitest';
import { initialPresenterState, type MapScene } from '@trifold/api';
import {
  Combatant,
  type CombatState,
  type NPC,
  type PCCard,
  type Scene,
  type Token,
} from '@trifold/schema';
import { blankNpc, blankPc } from '../campaign/CharacterEditors';
import { tableOverlays, tableScreen, tableSnapshotFrom, type SnapshotInput } from './snapshot';

const T = '2026-01-01T00:00:00.000Z';

const pc = (id: string, extra: Partial<PCCard> = {}): PCCard => ({
  ...blankPc(),
  id,
  name: id,
  maxHp: 24,
  ac: 16,
  playerControllable: true,
  ...extra,
});

const npc = (id: string, extra: Partial<NPC> = {}): NPC => ({
  ...blankNpc(),
  id,
  name: id,
  playerControllable: true,
  createdAt: T,
  updatedAt: T,
  ...extra,
});

const token = (id: string, extra: Partial<Token>): Token => ({
  id,
  kind: 'creature',
  ref: { kind: 'custom', name: id },
  label: id,
  x: 0,
  y: 0,
  footprint: 1,
  role: 'enemy',
  hidden: false,
  nameMasked: false,
  dead: false,
  ...extra,
});

const map = (tokens: Token[], extra: Partial<Scene> = {}): Scene => ({
  schemaVersion: 1,
  id: 'bridge',
  kind: 'map',
  title: 'Holding the bridges',
  subtitle: '',
  showTitleOverride: null,
  parentId: null,
  order: 0,
  notes: '',
  tokens,
  entryMarkers: [],
  playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  image: { path: 'maps/b.jpg', displayPath: 'maps/b-display.jpg', width: 700, height: 700 },
  grid: { cellPx: 70, offsetX: 0, offsetY: 0, color: '#000', opacity: 0.3, showToPlayers: true },
  createdAt: T,
  updatedAt: T,
  ...extra,
});

const live = (scene: Scene) => ({
  ...initialPresenterState,
  live: true,
  blackout: false,
  scene: { kind: 'map', id: scene.id } as MapScene,
});

function input(extra: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    campaign: { id: 'c1', name: 'The Lantern at Greyford', tokenStyle: 'engraved' },
    pcs: [],
    npcs: [],
    presenter: initialPresenterState,
    liveScene: null,
    combat: null,
    artFor: () => undefined,
    portraitUrl: (p) => `trifold-media://library/campaigns/g/${p}`,
    ...extra,
  };
}

describe('tableSnapshotFrom', () => {
  it('offers every PC unless unticked, and only ticked NPCs', () => {
    const snap = tableSnapshotFrom(
      input({
        pcs: [
          pc('wren', { playerControllable: undefined }),
          pc('tamsin', { playerControllable: false }),
        ],
        npcs: [npc('hesper', { playerControllable: undefined }), npc('tobin')],
      }),
    );
    expect(snap.creatures.map((c) => c.id)).toEqual(['wren', 'tobin']);
  });

  it('leaves out an unticked PC and an unticked NPC', () => {
    const snap = tableSnapshotFrom(
      input({
        pcs: [pc('brannoc'), pc('tamsin', { playerControllable: false })],
        npcs: [npc('hesper', { playerControllable: undefined })],
      }),
    );
    expect(snap.creatures.map((c) => c.id)).toEqual(['brannoc']);
  });

  it('takes a PC’s numbers from its card outside a fight', () => {
    const snap = tableSnapshotFrom(
      input({ pcs: [pc('brannoc', { currentHp: 11, tempHp: 3, portrait: 'portraits/b.png' })] }),
    );
    expect(snap.creatures[0]).toMatchObject({
      hp: { current: 11, max: 24, temp: 3 },
      ac: 16,
      conditions: [],
      portraitSrc: 'trifold-media://library/campaigns/g/portraits/b.png',
    });
  });

  it('takes numbers and conditions from the loaded fight', () => {
    const fighter = Combatant.parse({
      id: 'k1',
      name: 'Brannoc Hale',
      maskedName: 'Brannoc Hale',
      ref: { kind: 'pc', pcId: 'brannoc', name: 'Brannoc Hale' },
      role: 'ally',
      hp: { current: 5, max: 24, temp: 0 },
      ac: 18,
      conditions: [
        { id: 'x', name: 'Prone' },
        { id: 'y', name: 'Exhaustion', level: 2 },
      ],
    });
    const combat = {
      round: 1,
      turnIndex: 0,
      combatants: [fighter],
      log: [],
      startedAt: T,
    } as CombatState;
    const snap = tableSnapshotFrom(input({ pcs: [pc('brannoc')], combat }));
    expect(snap.creatures[0]).toMatchObject({
      hp: { current: 5 },
      ac: 18,
      conditions: [
        { id: 'x', name: 'Prone' },
        { id: 'y', name: 'Exhaustion', level: 2 },
      ],
      inFight: true,
      needsInitiative: true,
      editable: { hp: true, maxHp: true, ac: true, conditions: true },
    });
  });

  it('never offers an NPC marked enemy on the live scene; ally or no token is fine', () => {
    const tokens = [
      token('t-gorm', { ref: { kind: 'npc', npcId: 'gorm', name: 'Gorm Tallow' }, role: 'enemy' }),
      token('t-tobin', { ref: { kind: 'npc', npcId: 'tobin', name: 'Tobin Marsh' }, role: 'ally' }),
    ];
    const scene = map(tokens);
    const snap = tableSnapshotFrom(
      input({
        npcs: [npc('gorm'), npc('tobin'), npc('mara')],
        liveScene: scene,
        presenter: live(scene),
      }),
    );
    expect(snap.creatures.map((c) => [c.id, c.claimable])).toEqual([
      ['gorm', false],
      ['tobin', true],
      ['mara', true],
    ]);
  });

  it('sends the live map with fog, masks and creature links, and nothing behind a blackout', () => {
    const tokens = [
      token('t-b', { kind: 'pc', ref: { kind: 'pc', pcId: 'brannoc', name: 'B' }, role: 'ally' }),
      token('t-x', {
        nameMasked: true,
        maskedLabel: 'Humanoid',
        label: 'Gorm Tallow',
        glyph: 'goblin-head',
      }),
    ];
    const scene = map(tokens, {
      fog: {
        enabled: true,
        shapes: [{ id: 'f', mode: 'reveal', kind: 'rect', x: 0, y: 0, w: 100, h: 100 }],
      },
    });
    const snap = tableSnapshotFrom(input({ liveScene: scene, presenter: live(scene) }));
    expect(snap.scene).toMatchObject({
      id: 'bridge',
      width: 700,
      hasImage: true,
      fog: { enabled: true },
    });
    expect(snap.scene!.tokens[0]!.creature).toEqual({ kind: 'pc', id: 'brannoc' });
    expect(snap.scene!.tokens[1]).toMatchObject({
      label: 'Humanoid',
      glyphSrc: expect.stringContaining('goblin-head'),
    });
    expect(JSON.stringify(snap.scene)).not.toContain('Gorm Tallow');

    const dark = tableSnapshotFrom(
      input({ liveScene: scene, presenter: { ...live(scene), blackout: true } }),
    );
    expect(dark.scene).toBeNull();
  });

  it('gives a new fog a new image key', () => {
    const a = map([]);
    const b = map([], { fog: { enabled: true, shapes: [] } });
    const ka = tableSnapshotFrom(input({ liveScene: a, presenter: live(a) })).scene!.imageKey;
    const kb = tableSnapshotFrom(input({ liveScene: b, presenter: live(b) })).scene!.imageKey;
    expect(ka).not.toBe(kb);
  });

  it('gives another background a new image key, so phones fetch it', () => {
    // A scene's Backgrounds swap the picture in place: same scene, same fog, new image.
    const day = map([]);
    const night = map([], {
      image: { path: 'maps/n.jpg', displayPath: 'maps/n-display.jpg', width: 700, height: 700 },
    });
    const kd = tableSnapshotFrom(input({ liveScene: day, presenter: live(day) })).scene!.imageKey;
    const kn = tableSnapshotFrom(input({ liveScene: night, presenter: live(night) })).scene!
      .imageKey;
    expect(kd).not.toBe(kn);
  });

  it('sends no map and no screen until the DM goes live (ADR 0046)', () => {
    const scene = map([]);
    const waiting = tableSnapshotFrom(
      input({ liveScene: scene, presenter: { ...live(scene), live: false } }),
    );
    expect(waiting).toMatchObject({ live: false, scene: null, screen: null });
    expect(tableSnapshotFrom(input({ liveScene: scene, presenter: live(scene) })).live).toBe(true);
  });

  it('sends no map when the TV shows another scene', () => {
    const scene = map([]);
    const snap = tableSnapshotFrom(
      input({
        liveScene: scene,
        presenter: { ...live(scene), scene: { kind: 'title', id: 'other', title: 'x' } },
      }),
    );
    expect(snap.scene).toBeNull();
  });
});

describe('tableSnapshotFrom: what a device holds', () => {
  it('keeps a held character on the table even when it is not offered (Give to…)', () => {
    const snap = tableSnapshotFrom(
      input({
        pcs: [pc('tamsin', { playerControllable: false })],
        npcs: [npc('tobin', { playerControllable: undefined })],
        held: new Set(['pc:tamsin', 'npc:tobin']),
      }),
    );
    expect(snap.creatures.map((c) => [c.id, c.claimable])).toEqual([
      ['tamsin', false],
      ['tobin', false],
    ]);
  });
});

describe('tableSnapshotFrom: summons', () => {
  it('lists the summon list and the summons on the live map, with their owner', () => {
    const owl = token('to', {
      ref: {
        kind: 'record',
        ref: { recordId: 'owl', sourceId: 's', key: 'owl', edition: '2024' },
        name: 'Owl',
      },
      label: 'Owl',
      role: 'ally',
      summon: {
        ownerKind: 'pc',
        ownerId: 'brannoc',
        spawnedBy: 'Sam’s phone',
        type: 'Beast',
        hp: { current: 1, max: 1, temp: 0 },
        ac: 11,
        initiative: 'shared',
        concentration: true,
        concentrationLost: true,
        persistent: false,
      },
    });
    const scene = map([owl]);
    const snap = tableSnapshotFrom(
      input({
        campaign: {
          id: 'c1',
          name: 'G',
          tokenStyle: 'engraved',
          summonable: [
            {
              ref: { recordId: 'owl', sourceId: 's', key: 'owl', edition: '2024' },
              name: 'Owl',
              type: 'Beast',
              size: 'T',
              ac: 11,
              hp: 1,
            },
          ],
        },
        liveScene: scene,
        presenter: live(scene),
      }),
    );
    expect(snap.summonOptions).toEqual([{ key: 'owl', name: 'Owl', type: 'Beast', ac: 11, hp: 1 }]);
    expect(snap.creatures).toEqual([
      expect.objectContaining({
        kind: 'summon',
        id: 'to',
        hp: { current: 1, max: 1, temp: 0 },
        ac: 11,
        companionOf: 'brannoc',
        summon: {
          owner: { kind: 'pc', id: 'brannoc' },
          type: 'Beast',
          persistent: false,
          concentrationLost: true,
        },
      }),
    ]);
    expect(snap.scene!.tokens[0]!.creature).toEqual({ kind: 'summon', id: 'to' });
  });
});

describe('tableScreen (all screen types on phones)', () => {
  it('sends a title card, an image scene and the break screen; nothing behind a blackout', () => {
    expect(
      tableScreen({
        blackout: false,
        scene: { kind: 'title', id: 't', title: 'The Lantern', subtitle: 'Part one' },
      }),
    ).toEqual({
      kind: 'title',
      id: 't',
      title: 'The Lantern',
      subtitle: 'Part one',
      backdrop: 'dark',
    });
    expect(
      tableScreen({
        blackout: false,
        scene: {
          kind: 'image',
          id: 'i',
          title: 'Greyford',
          imageUrl: 'trifold-media://library/x.jpg',
          width: 800,
          height: 600,
        },
      }),
    ).toMatchObject({ kind: 'image', src: 'trifold-media://library/x.jpg' });
    expect(
      tableScreen({ blackout: false, scene: null, breakScreen: { title: 'Snacks', endsAt: 5 } }),
    ).toEqual({ kind: 'break', title: 'Snacks', endsAt: 5 });
    expect(
      tableScreen({ blackout: true, scene: { kind: 'title', id: 't', title: 'Hidden' } }),
    ).toBeNull();
  });
});

describe('tableOverlays: what the TV shows over the scene, for phones (ADR 0046)', () => {
  const combat = {
    round: 3,
    activeId: 'c2',
    entries: [
      {
        id: 'c1',
        name: 'Brannoc',
        role: 'ally' as const,
        isPc: true,
        dead: false,
        bloodied: false,
        tokenId: 't1',
        hpFraction: 0.5,
      },
      {
        id: 'c2',
        name: 'Humanoid 3',
        role: 'enemy' as const,
        isPc: false,
        dead: false,
        bloodied: true,
        tokenId: 't2',
      },
    ],
  };
  const timer = {
    id: 'tm',
    name: 'Guards return',
    status: 'running' as const,
    endsAt: 1000,
    leftMs: 0,
  };
  const counter = { id: 'k', name: 'Torches', value: 3, bound: null };
  const onAir = {
    ...initialPresenterState,
    live: true,
    blackout: false,
    scene: { kind: 'map', id: 'bridge', title: 'Holding the bridges' } as MapScene,
    showSceneTitle: true,
    combat,
    timer,
    counters: [counter],
  };

  it('sends each overlay the TV shows, without token ids', () => {
    const overlays = tableOverlays(onAir)!;
    expect(overlays).toMatchObject({
      sceneTitle: 'Holding the bridges',
      round: 3,
      timer,
      counters: [counter],
      initiative: { round: 3, activeId: 'c2' },
    });
    expect(overlays.initiative!.entries.map((e) => e.name)).toEqual(['Brannoc', 'Humanoid 3']);
    expect(JSON.stringify(overlays)).not.toContain('tokenId');
  });

  it('follows the overlay switches', () => {
    const off = tableOverlays({
      ...onAir,
      showSceneTitle: false,
      overlays: {
        ...onAir.overlays,
        initiativeStrip: false,
        roundCounter: false,
        timers: false,
        counters: false,
      },
    })!;
    expect(off).toEqual({ healthBars: false, timer: null, counters: [] });
  });

  it('sends nothing before going live or behind a blackout', () => {
    expect(tableOverlays({ ...onAir, live: false })).toBeUndefined();
    expect(tableOverlays({ ...onAir, blackout: true })).toBeUndefined();
  });
});
