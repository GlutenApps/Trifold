import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CampaignBundle, MapScene, TableTokenEvent } from '@trifold/api';
import type { Scene, Token } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { installTableSync } from '../../stores/tableStore';

const T = '2026-01-01T00:00:00.000Z';
const brannoc: Token = {
  id: 'tb',
  kind: 'pc',
  ref: { kind: 'pc', pcId: 'b', name: 'Brannoc Hale' },
  label: 'Brannoc Hale',
  x: 1,
  y: 1,
  footprint: 1,
  role: 'ally',
  hidden: false,
  nameMasked: false,
  dead: false,
};
const grid: Scene = {
  schemaVersion: 1,
  id: 's1',
  kind: 'blankGrid',
  title: 'Bridge',
  subtitle: '',
  showTitleOverride: null,
  parentId: null,
  order: 0,
  notes: '',
  tokens: [brannoc],
  entryMarkers: [],
  playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  createdAt: T,
  updatedAt: T,
};

const liveToken = () =>
  (usePresenterStore.getState().state.scene as MapScene).tokens.find((t) => t.id === 'tb')!;

describe('player drags on the console', () => {
  let off: () => void = () => undefined;
  let emit: (event: TableTokenEvent) => void;

  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c', slug: 'g', name: 'G', settings: { tokenStyle: 'engraved' } },
        pcs: [],
        npcs: [],
        scenes: [grid],
      } as unknown as CampaignBundle,
    });
    useSceneStore.setState({ selectedId: null, draft: null });
    usePresenterStore.setState({ moving: {} });
    usePresenterStore.getState().showScene(grid, 'g');
    off = installTableSync();
    const calls = (window.trifold.on as unknown as { mock: { calls: Array<[string, unknown]> } })
      .mock.calls;
    emit = calls.filter(([e]) => e === 'tableToken').at(-1)![1] as typeof emit;
  });

  afterEach(() => off());

  it('shows a preview on the TV without saving it, and forgets it when the drag ends', () => {
    emit({ kind: 'preview', tokenId: 'tb', x: 4, y: 2, deviceLabel: 'Sam’s phone' });
    expect(liveToken()).toMatchObject({ x: 4, y: 2 });
    expect(usePresenterStore.getState().moving['tb']).toMatchObject({ label: 'Sam’s phone' });
    expect(window.trifold.scenes.save).not.toHaveBeenCalled();
    emit({ kind: 'previewEnd', tokenId: 'tb' });
    expect(liveToken()).toMatchObject({ x: 1, y: 1 });
  });

  it('puts a player’s move on the TV as a ruler from where it began, and takes it off after', () => {
    emit({
      kind: 'preview',
      tokenId: 'tb',
      x: 4,
      y: 1,
      deviceLabel: 'Sam’s phone',
      from: { x: 1, y: 1 },
    });
    expect(usePresenterStore.getState().state.ruler).toMatchObject({ sceneId: 's1', squares: 3 });
    emit({ kind: 'previewEnd', tokenId: 'tb' });
    expect(usePresenterStore.getState().state.ruler ?? null).toBeNull();
  });

  it('shows no ruler for a move that ends under fog', () => {
    const fogged = {
      ...grid,
      fog: {
        enabled: true,
        shapes: [
          { id: 'f', mode: 'reveal' as const, kind: 'rect' as const, x: 0, y: 0, w: 210, h: 700 },
        ],
      },
    };
    usePresenterStore.getState().showScene(fogged, 'g');
    emit({
      kind: 'preview',
      tokenId: 'tb',
      x: 6,
      y: 1,
      deviceLabel: 'Sam’s phone',
      from: { x: 1, y: 1 },
    });
    expect(usePresenterStore.getState().state.ruler ?? null).toBeNull();
  });

  it('moves the token for real on a drop, through the scene store', () => {
    emit({ kind: 'preview', tokenId: 'tb', x: 4, y: 2, deviceLabel: 'Sam’s phone' });
    emit({ kind: 'move', tokenId: 'tb', x: 5, y: 3, deviceLabel: 'Sam’s phone' });
    expect(usePresenterStore.getState().moving).toEqual({});
    const saved = (
      window.trifold.scenes.save as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.at(-1)![0] as Scene;
    expect(saved.tokens[0]).toMatchObject({ id: 'tb', x: 5, y: 3 });
    expect(liveToken()).toMatchObject({ x: 5, y: 3 });
  });
});
