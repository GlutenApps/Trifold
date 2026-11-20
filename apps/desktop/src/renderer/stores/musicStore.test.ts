import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newPlaylist, useMusicStore } from './musicStore';
import { AudioEngine } from '../features/music/engine';

describe('audio source', () => {
  beforeEach(() => {
    useMusicStore.setState({ source: 'computer', playing: false, order: [], index: -1 });
  });

  it('remembers the choice through main and drops the phone when the computer is chosen', async () => {
    await useMusicStore.getState().setSource('phone');
    expect(useMusicStore.getState().source).toBe('phone');
    expect(window.trifold.phoneAudio.setSource).toHaveBeenCalledWith('phone');
    expect(window.trifold.phoneAudio.disconnect).not.toHaveBeenCalled();

    await useMusicStore.getState().setSource('computer');
    expect(window.trifold.phoneAudio.setSource).toHaveBeenCalledWith('computer');
    expect(window.trifold.phoneAudio.disconnect).toHaveBeenCalledTimes(1);
  });

  it('makes the player inert while the phone is the source', async () => {
    useMusicStore.setState({ source: 'phone', order: ['t1'], index: 0 });
    const player = useMusicStore.getState();
    await player.togglePlay();
    await player.playPlaylist('p1');
    await player.playTrack('t1');
    player.toggleMuted();
    expect(useMusicStore.getState().playing).toBe(false);
    expect(useMusicStore.getState().muted).toBe(false);
    expect(window.trifold.music.library).not.toHaveBeenCalled();
  });

  it('starts from the source main remembered', async () => {
    vi.mocked(window.trifold.phoneAudio.status).mockResolvedValue({
      supported: true,
      state: 'off',
      device: null,
      detail: null,
      remembered: [],
      source: 'phone',
    });
    await useMusicStore.getState().load();
    expect(useMusicStore.getState().source).toBe('phone');
  });
});

describe('scene-linked music', () => {
  const track = (id: string) => ({
    id,
    path: `C:/music/${id}.mp3`,
    title: id,
    durationSec: 60,
    gainDb: null,
    tags: [],
    kind: 'music' as const,
    addedAt: '2026-11-20T00:00:00.000Z',
    available: true,
  });
  let play: ReturnType<typeof vi.spyOn>;
  let setLoop: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(AudioEngine.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(AudioEngine.prototype, 'preload').mockImplementation(() => {});
    setLoop = vi.spyOn(AudioEngine.prototype, 'setLoop').mockImplementation(() => {});
    const playlist = { ...newPlaylist('Tavern'), id: 'p1', trackIds: ['t1', 't2'], loop: true };
    useMusicStore.setState({
      source: 'computer',
      playing: false,
      order: [],
      index: -1,
      loopTrack: false,
      playlistLoop: null,
      playlistId: null,
      playlists: [playlist],
      library: { tracks: [track('t1'), track('t2')] } as never,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("lets a scene's Loop override the playlist's own, until the DM's loop button", async () => {
    await useMusicStore.getState().playPlaylist('p1', { loop: false });
    expect(useMusicStore.getState().playlistLoop).toBe(false);
    // The playlist's saved setting is left alone.
    expect(useMusicStore.getState().playlists[0]!.loop).toBe(true);
    await useMusicStore.getState().cycleLoop();
    expect(useMusicStore.getState().playlistLoop).toBeNull();
  });

  it('plays a single track for a scene, looping it, and does not restart it when it plays', async () => {
    await useMusicStore.getState().playTrack('t2', null, { ifDifferent: true, loop: true });
    expect(useMusicStore.getState()).toMatchObject({
      order: ['t2'],
      playlistId: null,
      loopTrack: true,
    });
    expect(play).toHaveBeenCalledTimes(1);

    // The next scene links the same track without looping: no restart, the loop just changes.
    await useMusicStore.getState().playTrack('t2', null, { ifDifferent: true, loop: false });
    expect(play).toHaveBeenCalledTimes(1);
    expect(useMusicStore.getState().loopTrack).toBe(false);
    expect(setLoop).toHaveBeenLastCalledWith(false);
  });
});
