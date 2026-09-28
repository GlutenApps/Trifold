import { useEffect } from 'react';
import { useMusicStore } from '../../stores/musicStore';
import { formatTime } from './queue';

/** Now playing, transport, seek, volumes and output device. Used by the Music panel and the tray. */
export function MusicTransport() {
  const music = useMusicStore();
  const current = music.order[music.index];
  const track = music.library?.tracks.find((t) => t.id === current) ?? null;
  const playlist = music.playlists.find((p) => p.id === music.playlistId) ?? null;
  const { settings } = music;

  useEffect(() => {
    void music.refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card player-card" data-testid="music-player">
      <p className="now-playing">
        {track ? (
          <>
            <strong>{track.title}</strong>
            {track.artist ? <span className="muted"> · {track.artist}</span> : null}
            {playlist ? <span className="muted"> · {playlist.name}</span> : null}
          </>
        ) : (
          <span className="muted">Nothing playing</span>
        )}
      </p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => void music.previous()}
          disabled={!track}
          title="Ctrl+Alt+Left"
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void music.togglePlay()}
          disabled={!track && music.order.length === 0}
          title="Ctrl+Alt+P"
        >
          {music.playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void music.next()}
          disabled={!track}
          title="Ctrl+Alt+Right"
        >
          ⏭
        </button>
        <button type="button" className="btn" onClick={music.stop} disabled={!track}>
          Stop
        </button>
        <button
          type="button"
          className={`btn${music.muted ? ' danger' : ''}`}
          aria-pressed={music.muted}
          onClick={music.toggleMuted}
          title="Ctrl+Alt+M"
        >
          {music.muted ? 'Unmute' : 'Panic mute'}
        </button>
        <span className="muted small">
          {formatTime(music.position.current)} / {formatTime(music.position.duration)}
        </span>
      </div>
      <input
        type="range"
        aria-label="Position"
        min={0}
        max={Math.max(1, Math.floor(music.position.duration))}
        value={Math.floor(music.position.current)}
        onChange={(e) => music.seek(Number(e.target.value))}
        disabled={!track}
        className="wide"
      />
      <div className="row">
        <label className="field inline">
          Master
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={settings.masterVolume}
            onChange={(e) => void music.updateSettings({ masterVolume: Number(e.target.value) })}
          />
        </label>
        <label className="field inline">
          Music
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={settings.musicVolume}
            onChange={(e) => void music.updateSettings({ musicVolume: Number(e.target.value) })}
          />
        </label>
        <label className="field inline">
          Crossfade
          <input
            type="number"
            className="narrow"
            min={1}
            max={10}
            step={0.5}
            value={settings.crossfadeSec}
            onChange={(e) =>
              void music.updateSettings({
                crossfadeSec: Math.min(10, Math.max(1, Number(e.target.value) || 4)),
              })
            }
          />
          s
        </label>
        <label className="field inline">
          Output
          <select
            value={settings.outputDeviceId ?? ''}
            onChange={(e) => void music.updateSettings({ outputDeviceId: e.target.value || null })}
            onFocus={() => void music.refreshDevices()}
          >
            <option value="">System default</option>
            {music.devices
              .filter((d) => d.deviceId !== 'default' && d.deviceId !== '')
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      {music.measuring && (
        <p className="muted small">
          Measuring loudness: {music.measuring.remaining} track
          {music.measuring.remaining === 1 ? '' : 's'} left
        </p>
      )}
    </div>
  );
}
