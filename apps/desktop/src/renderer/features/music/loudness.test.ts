import { describe, expect, it } from 'vitest';
import { gainToTarget, integratedLoudness, kWeighting } from './loudness';

function sine(freq: number, seconds: number, amplitude: number, sampleRate = 48000): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

describe('integrated loudness', () => {
  it('measures a full-scale 1 kHz sine at about −3 LUFS per BS.1770', () => {
    const lufs = integratedLoudness([sine(1000, 3, 1)], 48000);
    expect(lufs).toBeGreaterThan(-3.6);
    expect(lufs).toBeLessThan(-2.6);
  });

  it('adds channels and tracks level changes', () => {
    const stereo = integratedLoudness([sine(1000, 3, 0.5), sine(1000, 3, 0.5)], 44100);
    const mono = integratedLoudness([sine(1000, 3, 0.5)], 44100);
    expect(stereo - mono).toBeCloseTo(3.01, 0);
    const quieter = integratedLoudness([sine(1000, 3, 0.25)], 44100);
    expect(mono - quieter).toBeCloseTo(6.02, 0);
  });

  it('gates silence so a quiet tail does not drag the reading down', () => {
    const loud = sine(1000, 2, 0.5);
    const tail = new Float32Array(2 * 48000);
    const joined = new Float32Array(loud.length + tail.length);
    joined.set(loud);
    joined.set(tail, loud.length);
    const withTail = integratedLoudness([joined], 48000);
    const without = integratedLoudness([loud], 48000);
    expect(Math.abs(withTail - without)).toBeLessThan(0.5);
    expect(integratedLoudness([tail], 48000)).toBe(-Infinity);
  });

  it('derives gains toward −16 LUFS and clamps them', () => {
    expect(gainToTarget(-23)).toBe(7);
    expect(gainToTarget(-10)).toBe(-6);
    expect(gainToTarget(-60)).toBe(24);
    expect(gainToTarget(-Infinity)).toBe(0);
  });

  it('keeps the K-weighting shelf near unity at 1 kHz and +4 dB at high frequencies', () => {
    const [shelf] = kWeighting(48000);
    const gainAt = (freq: number) => {
      const w = (2 * Math.PI * freq) / 48000;
      const num = {
        re: shelf.b0 + shelf.b1 * Math.cos(w) + shelf.b2 * Math.cos(2 * w),
        im: -(shelf.b1 * Math.sin(w) + shelf.b2 * Math.sin(2 * w)),
      };
      const den = {
        re: 1 + shelf.a1 * Math.cos(w) + shelf.a2 * Math.cos(2 * w),
        im: -(shelf.a1 * Math.sin(w) + shelf.a2 * Math.sin(2 * w)),
      };
      return 20 * Math.log10(Math.hypot(num.re, num.im) / Math.hypot(den.re, den.im));
    };
    expect(Math.abs(gainAt(100))).toBeLessThan(0.1);
    expect(gainAt(10000)).toBeGreaterThan(3.5);
  });
});
