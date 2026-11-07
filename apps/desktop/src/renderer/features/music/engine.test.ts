import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, equalPowerCurve } from './engine';

/* A recording stand-in for the Web Audio graph: every AudioParam remembers how it was asked to
   change, so the tests can assert that levels move on a curve and never jump. */

class FakeParam {
  value = 1;
  calls: string[] = [];
  cancelScheduledValues(): void {
    this.calls.push('cancel');
  }
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.calls.push(`linear→${v}`);
    this.value = v;
  }
  setValueCurveAtTime(curve: Float32Array, _at: number, seconds: number): void {
    const to = curve[curve.length - 1]!;
    this.calls.push(`curve→${to.toFixed(2)} over ${seconds}s`);
    this.value = to;
  }
}

class FakeGain {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}

class FakeContext {
  static last: FakeContext | null = null;
  currentTime = 0;
  state = 'running';
  destination = {};
  gains: FakeGain[] = [];
  constructor() {
    FakeContext.last = this;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createMediaElementSource(): { connect(): void; disconnect(): void } {
    return { connect() {}, disconnect() {} };
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeAudio {
  static all: FakeAudio[] = [];
  src = '';
  loop = false;
  paused = true;
  crossOrigin = '';
  preload = '';
  currentTime = 0;
  duration = NaN;
  onended: (() => void) | null = null;
  constructor() {
    FakeAudio.all.push(this);
  }
  load(): void {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

/** Gains are created in order: master, music, ambience, sfx, then one per played track. */
const voiceGain = (n: number) => FakeContext.last!.gains[4 + n]!;

describe('equalPowerCurve', () => {
  it('starts and ends exactly on the requested levels', () => {
    const up = equalPowerCurve(0, 0.8);
    expect(up[0]).toBeCloseTo(0);
    expect(up[up.length - 1]).toBeCloseTo(0.8);
    const down = equalPowerCurve(0.8, 0);
    expect(down[0]).toBeCloseTo(0.8);
    expect(down[down.length - 1]).toBeCloseTo(0);
  });

  it('is monotonic and crosses the midpoint on the sine, not the line', () => {
    const up = equalPowerCurve(0, 1);
    for (let i = 1; i < up.length; i += 1) expect(up[i]).toBeGreaterThanOrEqual(up[i - 1]!);
    const mid = up[Math.floor(up.length / 2)]!;
    expect(mid).toBeGreaterThan(0.6); // sin(π/4) ≈ 0.71; a linear fade would sit at 0.5
  });
});

describe('AudioEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.all = [];
    FakeContext.last = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fades a new track in on a curve from silence', async () => {
    const engine = new AudioEngine();
    await engine.play('t1', 'trifold-media://a.mp3', 0, 2);
    expect(voiceGain(0).gain.calls).toEqual(['cancel', 'curve→1.00 over 1s']); // first start caps at 1 s
  });

  it('crossfades: the outgoing track ramps to silence and is paused only after the fade', async () => {
    const engine = new AudioEngine();
    await engine.play('t1', 'trifold-media://a.mp3', 0, 2);
    await engine.play('t2', 'trifold-media://b.mp3', 0, 2);
    const first = FakeAudio.all[0]!;
    expect(voiceGain(0).gain.calls.at(-1)).toBe('curve→0.00 over 2s');
    expect(first.paused).toBe(false);
    vi.advanceTimersByTime(2100);
    expect(first.paused).toBe(true);
    expect(voiceGain(1).gain.calls.at(-1)).toBe('curve→1.00 over 2s');
  });

  it('never stops without a fade', async () => {
    const engine = new AudioEngine();
    await engine.play('t1', 'trifold-media://a.mp3', 0, 1);
    engine.stop(0.5);
    const el = FakeAudio.all[0]!;
    expect(voiceGain(0).gain.calls.at(-1)).toBe('curve→0.00 over 0.5s');
    expect(el.paused).toBe(false);
    vi.advanceTimersByTime(600);
    expect(el.paused).toBe(true);
    expect(engine.position().trackId).toBeNull();
  });

  it('panic mute drops the master in 50 ms and restores it over 300 ms', async () => {
    const engine = new AudioEngine();
    await engine.play('t1', 'trifold-media://a.mp3', 0, 1);
    const master = FakeContext.last!.gains[0]!.gain;
    engine.setMuted(true);
    expect(master.calls.at(-1)).toBe('curve→0.00 over 0.05s');
    engine.setMuted(false);
    expect(master.calls.at(-1)).toBe('curve→0.80 over 0.3s');
  });
});
