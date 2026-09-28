import { dbToGain } from './loudness';

/**
 * The one AudioContext (CLAUDE.md "Audio"): master gain → destination, one gain per layer, one
 * per playing track. Every level change is a ramp on an equal-power curve; nothing is stopped
 * without a fade. Tracks stream through <audio> elements so long files never sit in memory.
 */

export type Layer = 'music' | 'ambience' | 'sfx';

interface Voice {
  trackId: string;
  el: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
}

interface Volumes {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
}

const FADE_STEPS = 64;

function equalPowerCurve(from: number, to: number): Float32Array {
  const curve = new Float32Array(FADE_STEPS);
  for (let i = 0; i < FADE_STEPS; i += 1) {
    const t = i / (FADE_STEPS - 1);
    const rising = Math.sin((t * Math.PI) / 2);
    const falling = Math.cos((t * Math.PI) / 2);
    curve[i] = from < to ? from + (to - from) * rising : to + (from - to) * falling;
  }
  return curve;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Record<Layer, GainNode> | null = null;
  private current: Voice | null = null;
  private volumes: Volumes = { master: 0.8, music: 0.8, ambience: 0.6, sfx: 0.8 };
  private muted = false;
  private preloaded = new Map<string, HTMLAudioElement>();
  onEnded: ((trackId: string) => void) | null = null;

  /** Created on first use so the context starts from a user gesture. */
  private ensure(): { ctx: AudioContext; master: GainNode; layers: Record<Layer, GainNode> } {
    if (!this.ctx || !this.master || !this.layers) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volumes.master;
      master.connect(ctx.destination);
      const make = (layer: Layer) => {
        const g = ctx.createGain();
        g.gain.value = this.volumes[layer];
        g.connect(master);
        return g;
      };
      this.ctx = ctx;
      this.master = master;
      this.layers = { music: make('music'), ambience: make('ambience'), sfx: make('sfx') };
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, master: this.master, layers: this.layers };
  }

  private ramp(param: AudioParam, to: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const from = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    if (seconds <= 0.01 || from === to) {
      param.linearRampToValueAtTime(to, now + 0.01);
      return;
    }
    param.setValueCurveAtTime(equalPowerCurve(from, to), now, seconds);
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...v };
    if (!this.ctx || !this.master || !this.layers) return;
    if (v.master !== undefined && !this.muted) this.ramp(this.master.gain, v.master, 0.05);
    for (const layer of ['music', 'ambience', 'sfx'] as const) {
      if (v[layer] !== undefined) this.ramp(this.layers[layer].gain, v[layer]!, 0.05);
    }
  }

  /** Panic mute: master to silence in 50 ms, back over 300 ms. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.master) return;
    this.ramp(this.master.gain, muted ? 0 : this.volumes.master, muted ? 0.05 : 0.3);
  }

  async setSink(deviceId: string | null): Promise<void> {
    const { ctx } = this.ensure();
    const sinkable = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!sinkable.setSinkId) throw new Error('This build cannot choose an output device');
    await sinkable.setSinkId(deviceId ?? '');
  }

  /** Decodes the next track ahead of time so a crossfade starts on the keypress. */
  preload(url: string): void {
    if (this.preloaded.has(url)) return;
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.src = url;
    el.load();
    this.preloaded.set(url, el);
    if (this.preloaded.size > 3) {
      const [oldest] = this.preloaded.keys();
      if (oldest && oldest !== url) this.preloaded.delete(oldest);
    }
  }

  private takeElement(url: string): HTMLAudioElement {
    const el = this.preloaded.get(url) ?? new Audio();
    this.preloaded.delete(url);
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    if (!el.src) el.src = url;
    return el;
  }

  /** Crossfades from whatever is playing to this track. */
  async play(trackId: string, url: string, gainDb: number, fadeSec: number): Promise<void> {
    const { ctx, layers } = this.ensure();
    const el = this.takeElement(url);
    el.loop = false;
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(layers.music);
    const voice: Voice = { trackId, el, gain, source };
    el.onended = () => {
      if (this.current === voice) this.onEnded?.(trackId);
    };
    const previous = this.current;
    this.current = voice;
    const fade = previous ? fadeSec : Math.min(fadeSec, 1);
    if (previous) this.release(previous, fadeSec);
    try {
      await el.play();
    } catch (err) {
      this.current = previous && this.current === voice ? null : this.current;
      throw err;
    }
    this.ramp(gain.gain, dbToGain(gainDb), fade);
  }

  private release(voice: Voice, fadeSec: number): void {
    this.ramp(voice.gain.gain, 0, fadeSec);
    window.setTimeout(
      () => {
        voice.el.pause();
        voice.el.onended = null;
        voice.source.disconnect();
        voice.gain.disconnect();
        voice.el.src = '';
      },
      fadeSec * 1000 + 100,
    );
  }

  /** Fades the current track out and stops it. */
  stop(fadeSec: number): void {
    const voice = this.current;
    if (!voice) return;
    this.current = null;
    this.release(voice, fadeSec);
  }

  pause(fadeSec: number): void {
    const voice = this.current;
    if (!voice || voice.el.paused) return;
    this.ramp(voice.gain.gain, 0, fadeSec);
    const el = voice.el;
    window.setTimeout(() => {
      if (this.current === voice) el.pause();
    }, fadeSec * 1000);
  }

  async resume(gainDb: number, fadeSec: number): Promise<void> {
    const voice = this.current;
    if (!voice) return;
    this.ensure();
    await voice.el.play();
    this.ramp(voice.gain.gain, dbToGain(gainDb), fadeSec);
  }

  /** Re-applies a track's gain after a loudness measurement lands mid-play. */
  setTrackGain(trackId: string, gainDb: number): void {
    const voice = this.current;
    if (voice && voice.trackId === trackId && !voice.el.paused) {
      this.ramp(voice.gain.gain, dbToGain(gainDb), 0.5);
    }
  }

  seek(seconds: number): void {
    if (this.current) this.current.el.currentTime = seconds;
  }

  position(): { trackId: string | null; current: number; duration: number; paused: boolean } {
    const voice = this.current;
    if (!voice) return { trackId: null, current: 0, duration: 0, paused: true };
    return {
      trackId: voice.trackId,
      current: voice.el.currentTime,
      duration: Number.isFinite(voice.el.duration) ? voice.el.duration : 0,
      paused: voice.el.paused,
    };
  }

  /** Decodes a whole file for the loudness pass; runs off the live graph. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ctx ?? new OfflineAudioContext(2, 1, 48000);
    return ctx.decodeAudioData(data);
  }
}
