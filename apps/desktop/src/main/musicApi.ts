import { dialog } from 'electron';
import { EVENT_CHANNELS, type TrifoldApi } from '@trifold/api';
import type { LibrarySession } from './library/session';
import type { WindowManager } from './windows';

/** The `music` namespace (DESIGN.md §6.6), backed by MusicRepository. */
export function createMusicApi(
  session: LibrarySession,
  windows: WindowManager,
): Pick<TrifoldApi, 'music'> {
  const repo = () => {
    const music = session.music;
    if (!music) throw new Error('No Library is open');
    return music;
  };
  const progress = (p: unknown) => windows.sendToConsole(EVENT_CHANNELS.musicScan, p);
  return {
    music: {
      async library() {
        return repo().view();
      },
      async chooseFolder() {
        const result = await dialog.showOpenDialog({
          title: 'Add a music folder',
          properties: ['openDirectory'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      async addFolder(path) {
        return repo().addFolder(path, progress);
      },
      async removeFolder(path) {
        return repo().removeFolder(path);
      },
      async rescan() {
        return repo().scan(progress);
      },
      async updateTrack(trackId, patch) {
        return repo().updateTrack(trackId, patch);
      },
      async listPlaylists() {
        return repo().listPlaylists();
      },
      async savePlaylist(playlist) {
        return repo().savePlaylist(playlist);
      },
      async removePlaylist(playlistId) {
        await repo().removePlaylist(playlistId);
      },
    },
  };
}
