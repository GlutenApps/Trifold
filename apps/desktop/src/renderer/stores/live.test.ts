import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialPresenterState, type CampaignBundle } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { useAppStore } from './appStore';
import { useCampaignStore } from './campaignStore';
import { endLive, goLive } from './live';
import { useMusicStore } from './musicStore';
import { usePresenterStore } from './presenterStore';
import { useSceneStore } from './sceneStore';

/** Going live (ADR 0046): the table's output switch, apart from which scene is active. */
const now = '2026-11-20T00:00:00.000Z';
const card = {
  schemaVersion: 1,
  id: 'card',
  kind: 'title',
  title: 'The inn',
  subtitle: '',
  showTitleOverride: null,
  parentId: null,
  order: 0,
  notes: '',
  tokens: [],
  entryMarkers: [],
  playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  audio: { ambienceIds: [], playlistId: 'tavern' },
  createdAt: now,
  updatedAt: now,
} as unknown as Scene;

describe('go live', () => {
  let playPlaylist: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: { slug: 'inn', settings: {} },
        scenes: [card],
      } as unknown as CampaignBundle,
    });
    usePresenterStore.setState({
      state: initialPresenterState,
      history: [],
      recent: [],
      liveOverride: null,
      liveSource: null,
    });
    useAppStore.setState({ playerOpen: false });
    playPlaylist = vi.fn(async () => {});
    useMusicStore.setState({ playPlaylist } as never);
  });

  it("waits for Go live to start an active scene's music, then opens the TV", async () => {
    useSceneStore.getState().send(card);
    expect(usePresenterStore.getState().state.scene?.id).toBe('card');
    expect(playPlaylist).not.toHaveBeenCalled();

    await goLive();
    expect(usePresenterStore.getState().state.live).toBe(true);
    expect(playPlaylist).toHaveBeenCalledWith('tavern', { ifDifferent: true });
    expect(useAppStore.getState().playerOpen).toBe(true);

    // Live, setting a scene starts its music at once.
    playPlaylist.mockClear();
    useSceneStore.getState().send(card);
    expect(playPlaylist).toHaveBeenCalledTimes(1);
  });

  it('keeps the active scene when it ends, and closes the TV', async () => {
    useSceneStore.getState().send(card);
    await goLive();
    await endLive();
    expect(usePresenterStore.getState().state).toMatchObject({
      live: false,
      scene: { id: 'card' },
    });
    expect(window.trifold.player.close).toHaveBeenCalled();
    expect(useAppStore.getState().playerOpen).toBe(false);
  });
});
