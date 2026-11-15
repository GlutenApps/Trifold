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
import { tableSnapshotFrom, type SnapshotInput } from './snapshot';

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
    const ka = tableSnapshotFrom(input({ liveScene: a, presenter: live(a) })).scene!.fogKey;
    const kb = tableSnapshotFrom(input({ liveScene: b, presenter: live(b) })).scene!.fogKey;
    expect(ka).not.toBe(kb);
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
