import { create } from 'zustand';
import {
  trackUrl,
  type MusicLibraryView,
  type MusicScanProgress,
  type AudioSource,
  type TrackView,
} from '@trifold/api';
import { nowIso, type MusicSettings, type Playlist, type Track } from '@trifold/schema';
import { AudioEngine } from '../features/music/engine';
import { gainToTarget, integratedLoudness } from '../features/music/loudness';
import {
  buildOrder,
  loopMode,
  nextIndex,
  nextLoopMode,
  type LoopMode,
} from '../features/music/queue';

/**
 * The music controller (DESIGN.md §6.6): the scanned library and playlists as main reports
 * them, the Library-wide settings (volumes, crossfade, output device), and the session's queue
 * and transport. Settings persist through `library.updateSettings`; playlists, folders and
 * track edits go to main's music store; the queue, position, mute and loop-track are session
 * only and start empty. This module owns the one AudioEngine (one AudioContext, every change
 * through a fade), so features drive playback through these actions and never touch the engine.
 * With the phone chosen as the source (ADR 0007) the transport is inert.
 */
export interface OutputDevice {
  deviceId: string;
  label: string;
}

export interface MusicState {
  library: MusicLibraryView | null;
  playlists: Playlist[];
  scan: MusicScanProgress | null;
  devices: OutputDevice[];
  settings: MusicSettings;
  error: string | null;

  /** Playback. */
  playlistId: string | null;
  order: string[];
  index: number;
  playing: boolean;
  muted: boolean;
  /** Repeat the current track (session only); the playlist's own `loop` is saved with it. */
  loopTrack: boolean;
  position: { current: number; duration: number };
  /** Loudness pass: track being measured now, and how many remain. */
  measuring: { trackId: string; remaining: number } | null;
  /**
   * Where the table's music comes from (ADR 0007). With the phone chosen, Trifold's player is
   * paused and every transport action, hotkey and scene link is inert.
   */
  source: AudioSource;

  load(): Promise<void>;
  applySettings(settings: MusicSettings): void;
  updateSettings(patch: Partial<MusicSettings>): Promise<void>;
  refreshDevices(): Promise<void>;
  addFolder(): Promise<void>;
  removeFolder(path: string): Promise<void>;
  rescan(): Promise<void>;
  updateTrack(trackId: string, patch: Partial<Track>): Promise<void>;
  savePlaylist(playlist: Playlist): Promise<Playlist | null>;
  removePlaylist(playlistId: string): Promise<void>;
  addToPlaylist(playlistId: string, trackId: string): Promise<void>;
  removeFromPlaylist(playlistId: string, trackId: string): Promise<void>;

  /** Starts a playlist (crossfading from whatever plays). `ifDifferent` skips a restart of the same one. */
  playPlaylist(playlistId: string, options?: { ifDifferent?: boolean }): Promise<void>;
  playTrack(trackId: string, playlistId?: string | null): Promise<void>;
  togglePlay(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  stop(): void;
  seek(seconds: number): void;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  /** Off → loop playlist → loop track → off; a track played on its own skips "playlist". */
  cycleLoop(): Promise<void>;
  measureLoudness(): Promise<void>;
  clearError(): void;
  setSource(source: AudioSource): Promise<void>;
}

const engine = new AudioEngine();

export function newPlaylist(name: string): Playlist {
  return {
    schemaVersion: 1,
    id: '',
    name,
    trackIds: [],
    shuffle: false,
    loop: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export const useMusicStore = create<MusicState>((set, get) => {
  const fail = (err: unknown) => set({ error: err instanceof Error ? err.message : String(err) });
  const trackById = (id: string): TrackView | undefined =>
    get().library?.tracks.find((t) => t.id === id);
  const fadeFor = (playlistId: string | null) =>
    get().playlists.find((p) => p.id === playlistId)?.crossfadeSec ?? get().settings.crossfadeSec;

  let ticker: number | null = null;
  const startTicker = () => {
    if (ticker !== null) return;
    ticker = window.setInterval(() => {
      const p = engine.position();
      set({ position: { current: p.current, duration: p.duration } });
    }, 500);
  };

  const startAt = async (index: number): Promise<void> => {
    const { order, playlistId } = get();
    const id = order[index];
    const track = id ? trackById(id) : undefined;
    if (!track) return;
    if (!track.available) {
      // Skip missing files rather than stopping the session.
      const following = nextIndex({
        order,
        index,
        loop: get().playlists.find((p) => p.id === playlistId)?.loop ?? true,
      });
      if (following !== null && following !== index) return startAt(following);
      return;
    }
    set({ index, playing: true });
    try {
      await engine.play(
        track.id,
        trackUrl(track.id),
        track.gainDb ?? 0,
        fadeFor(playlistId),
        get().loopTrack,
      );
      startTicker();
      const upcoming = nextIndex({ order, index, loop: true });
      const upcomingId = upcoming !== null ? order[upcoming] : undefined;
      if (upcomingId && upcomingId !== track.id) engine.preload(trackUrl(upcomingId));
    } catch (err) {
      set({ playing: false });
      fail(err);
    }
  };

  engine.onEnded = () => {
    const { order, index, playlistId, playlists } = get();
    const loop = playlists.find((p) => p.id === playlistId)?.loop ?? false;
    const following = nextIndex({ order, index, loop });
    if (following === null) {
      set({ playing: false });
      return;
    }
    void startAt(following);
  };

  let measuringRun: Promise<void> | null = null;

  // Scan progress from main; the last `done` stays as the summary until the next scan.
  let listening = false;
  const listenForScans = () => {
    if (listening || typeof window.trifold?.on !== 'function') return;
    listening = true;
    window.trifold.on('musicScan', (scan) => set({ scan }));
  };

  return {
    library: null,
    playlists: [],
    scan: null,
    devices: [],
    settings: {
      outputDeviceId: null,
      masterVolume: 0.8,
      musicVolume: 0.8,
      ambienceVolume: 0.6,
      sfxVolume: 0.8,
      crossfadeSec: 4,
    },
    error: null,
    playlistId: null,
    order: [],
    index: -1,
    playing: false,
    muted: false,
    loopTrack: false,
    position: { current: 0, duration: 0 },
    measuring: null,
    source: 'computer',

    async load() {
      listenForScans();
      try {
        const [library, playlists, phone] = await Promise.all([
          window.trifold.music.library(),
          window.trifold.music.listPlaylists(),
          window.trifold.phoneAudio.status(),
        ]);
        set({ library, playlists, source: phone.source, error: null });
        void get().measureLoudness();
      } catch (err) {
        fail(err);
      }
    },

    applySettings(settings) {
      set({ settings });
      engine.setVolumes({
        master: settings.masterVolume,
        music: settings.musicVolume,
        ambience: settings.ambienceVolume,
        sfx: settings.sfxVolume,
      });
    },

    async updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      get().applySettings(settings);
      if (patch.outputDeviceId !== undefined) {
        try {
          await engine.setSink(patch.outputDeviceId);
        } catch (err) {
          fail(err);
        }
      }
      try {
        await window.trifold.library.updateSettings({ music: settings });
      } catch (err) {
        fail(err);
      }
    },

    async refreshDevices() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        const outputs = all.filter((d) => d.kind === 'audiooutput');
        set({
          devices: outputs.map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || (d.deviceId === 'default' ? 'System default' : `Output ${i + 1}`),
          })),
        });
      } catch {
        set({ devices: [] });
      }
    },

    async addFolder() {
      try {
        const path = await window.trifold.music.chooseFolder();
        if (!path) return;
        const library = await window.trifold.music.addFolder(path);
        set({ library });
        void get().measureLoudness();
      } catch (err) {
        fail(err);
      }
    },

    async removeFolder(path) {
      try {
        set({ library: await window.trifold.music.removeFolder(path) });
      } catch (err) {
        fail(err);
      }
    },

    async rescan() {
      try {
        listenForScans();
        set({ scan: { phase: 'listing', read: 0, found: 0, added: 0 } });
        // A rescan can drop deleted tracks from playlists, so both lists come back fresh.
        const library = await window.trifold.music.rescan();
        const playlists = await window.trifold.music.listPlaylists();
        set({ library, playlists });
        void get().measureLoudness();
      } catch (err) {
        set({ scan: null });
        fail(err);
      }
    },

    async updateTrack(trackId, patch) {
      try {
        const updated = await window.trifold.music.updateTrack(trackId, patch);
        const library = get().library;
        if (updated && library) {
          set({
            library: {
              ...library,
              tracks: library.tracks.map((t) => (t.id === trackId ? updated : t)),
            },
          });
          if (patch.gainDb !== undefined && updated.gainDb !== null)
            engine.setTrackGain(trackId, updated.gainDb);
        }
      } catch (err) {
        fail(err);
      }
    },

    async savePlaylist(playlist) {
      const sortIn = (list: Playlist[], p: Playlist) =>
        [...list.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name));
      // Shown at once, so a second edit made before this save returns starts from this one.
      if (playlist.id) set({ playlists: sortIn(get().playlists, playlist) });
      try {
        const saved = await window.trifold.music.savePlaylist(playlist);
        const current = get().playlists.find((p) => p.id === saved.id);
        // A newer edit may already be showing; its own save will land after this one.
        if (!playlist.id || current === playlist)
          set({ playlists: sortIn(get().playlists, saved) });
        return saved;
      } catch (err) {
        fail(err);
        return null;
      }
    },

    async addToPlaylist(playlistId, trackId) {
      const playlist = get().playlists.find((p) => p.id === playlistId);
      if (playlist && !playlist.trackIds.includes(trackId))
        await get().savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, trackId] });
    },

    async removeFromPlaylist(playlistId, trackId) {
      const playlist = get().playlists.find((p) => p.id === playlistId);
      if (playlist?.trackIds.includes(trackId))
        await get().savePlaylist({
          ...playlist,
          trackIds: playlist.trackIds.filter((id) => id !== trackId),
        });
    },

    async removePlaylist(playlistId) {
      try {
        await window.trifold.music.removePlaylist(playlistId);
        set({ playlists: get().playlists.filter((p) => p.id !== playlistId) });
        if (get().playlistId === playlistId) set({ playlistId: null });
      } catch (err) {
        fail(err);
      }
    },

    async playPlaylist(playlistId, options) {
      if (get().source === 'phone') return;
      const playlist = get().playlists.find((p) => p.id === playlistId);
      if (!playlist || playlist.trackIds.length === 0) return;
      if (options?.ifDifferent && get().playlistId === playlistId && get().playing) return;
      const order = buildOrder(playlist.trackIds, playlist.shuffle, null);
      // A new playlist (often a scene or combat change) plays through rather than sticking on
      // its first track.
      set({ playlistId, order, loopTrack: false });
      await startAt(0);
    },

    async playTrack(trackId, playlistId = null) {
      if (get().source === 'phone') return;
      const playlist = playlistId ? get().playlists.find((p) => p.id === playlistId) : undefined;
      const order = playlist ? buildOrder(playlist.trackIds, playlist.shuffle, trackId) : [trackId];
      set({ playlistId: playlist?.id ?? null, order });
      await startAt(Math.max(0, order.indexOf(trackId)));
    },

    async togglePlay() {
      if (get().source === 'phone') return;
      const { playing, order, index, playlistId } = get();
      const fade = Math.min(1, fadeFor(playlistId));
      if (playing) {
        engine.pause(fade);
        set({ playing: false });
        return;
      }
      const id = order[index];
      const track = id ? trackById(id) : undefined;
      if (!track) {
        if (order.length) await startAt(0);
        return;
      }
      set({ playing: true });
      await engine.resume(track.gainDb ?? 0, fade);
    },

    async next() {
      if (get().source === 'phone') return;
      const { order, index } = get();
      const following = nextIndex({ order, index, loop: true });
      if (following !== null) await startAt(following);
    },

    async previous() {
      if (get().source === 'phone') return;
      const { order, index } = get();
      if (engine.position().current > 5) {
        engine.seek(0);
        return;
      }
      const before = nextIndex({ order, index, loop: true }, -1);
      if (before !== null) await startAt(before);
    },

    stop() {
      engine.stop(fadeFor(get().playlistId));
      set({ playing: false, index: -1, position: { current: 0, duration: 0 } });
    },

    seek(seconds) {
      engine.seek(seconds);
    },

    setMuted(muted) {
      engine.setMuted(muted);
      set({ muted });
    },

    toggleMuted() {
      if (get().source === 'phone') return;
      get().setMuted(!get().muted);
    },

    async cycleLoop() {
      if (get().source === 'phone') return;
      const { loopTrack, playlistId, playlists } = get();
      const playlist = playlists.find((p) => p.id === playlistId) ?? null;
      const next: LoopMode = nextLoopMode(
        loopMode(loopTrack, playlist?.loop ?? null),
        playlist !== null,
      );
      set({ loopTrack: next === 'track' });
      engine.setLoop(next === 'track');
      if (playlist && playlist.loop !== (next !== 'off')) {
        await get().savePlaylist({ ...playlist, loop: next !== 'off' });
      }
    },

    /** Measures one unmeasured track at a time in the background (DESIGN.md §6.6). */
    async measureLoudness() {
      if (measuringRun) return measuringRun;
      measuringRun = (async () => {
        for (;;) {
          const pending =
            get().library?.tracks.filter((t) => t.gainDb === null && t.available) ?? [];
          const track = pending[0];
          if (!track) break;
          set({ measuring: { trackId: track.id, remaining: pending.length } });
          let gainDb = 0;
          try {
            const data = await fetch(trackUrl(track.id)).then((r) => r.arrayBuffer());
            const buffer = await engine.decode(data);
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
              buffer.getChannelData(i),
            );
            gainDb = gainToTarget(integratedLoudness(channels, buffer.sampleRate));
          } catch {
            gainDb = 0;
          }
          await get().updateTrack(track.id, { gainDb });
          if (get().library?.tracks.find((t) => t.id === track.id)?.gainDb === null) break;
        }
        set({ measuring: null });
      })().finally(() => {
        measuringRun = null;
      });
      return measuringRun;
    },

    clearError() {
      set({ error: null });
    },

    async setSource(source) {
      if (get().source === source) return;
      if (source === 'phone' && get().playing) {
        engine.pause(Math.min(1, fadeFor(get().playlistId)));
        set({ playing: false });
      }
      set({ source });
      try {
        await window.trifold.phoneAudio.setSource(source);
        if (source === 'computer') await window.trifold.phoneAudio.disconnect();
      } catch (err) {
        fail(err);
      }
    },
  };
});
