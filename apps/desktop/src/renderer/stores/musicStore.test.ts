import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMusicStore } from './musicStore';

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
