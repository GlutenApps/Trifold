/**
 * Integrated loudness per ITU-R BS.1770-4 / EBU R128 (DESIGN.md §6.6), in plain TypeScript so it
 * runs on decoded channel data with no native dependency: K-weighting (a high shelf then a high
 * pass), 400 ms blocks with 75 % overlap, an absolute gate at −70 LUFS and a relative gate 10 LU
 * below the ungated mean. Returns LUFS, or -Infinity for silence.
 */

export const LOUDNESS_TARGET_LUFS = -16;

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** BS.1770 stage-1 shelf and stage-2 high-pass, re-derived for any sample rate. */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  // Stage 1: high shelf, f0 = 1681.97 Hz, Q = 0.7072, gain = +3.9998 dB.
  const f0 = 1681.974450955533;
  const g = 3.999843853973347;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, g / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k1 / q1 + k1 * k1;
  const shelf: Biquad = {
    b0: (vh + (vb * k1) / q1 + k1 * k1) / a0,
    b1: (2 * (k1 * k1 - vh)) / a0,
    b2: (vh - (vb * k1) / q1 + k1 * k1) / a0,
    a1: (2 * (k1 * k1 - 1)) / a0,
    a2: (1 - k1 / q1 + k1 * k1) / a0,
  };
  // Stage 2: high pass, f0 = 38.135 Hz, Q = 0.5003.
  const f2 = 38.13547087602444;
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f2) / sampleRate);
  const d0 = 1 + k2 / q2 + k2 * k2;
  const highpass: Biquad = {
    b0: 1 / d0,
    b1: -2 / d0,
    b2: 1 / d0,
    a1: (2 * (k2 * k2 - 1)) / d0,
    a2: (1 - k2 / q2 + k2 * k2) / d0,
  };
  return [shelf, highpass];
}

function filterInPlace(samples: Float32Array, f: Biquad): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i]!;
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
}

/** Channel weights: L, R, C = 1; Ls, Rs = 1.41 (five-channel order per BS.1770). */
function weightFor(channel: number, channels: number): number {
  return channels >= 5 && (channel === 3 || channel === 4) ? 1.41 : 1;
}

export function integratedLoudness(channels: readonly Float32Array[], sampleRate: number): number {
  if (channels.length === 0 || (channels[0]?.length ?? 0) === 0) return -Infinity;
  const [shelf, highpass] = kWeighting(sampleRate);
  const blockLen = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const length = channels[0]!.length;
  if (length < blockLen) return -Infinity;

  // Mean square per block, summed over weighted channels.
  const blockCount = Math.floor((length - blockLen) / hop) + 1;
  const power = new Float64Array(blockCount);
  channels.forEach((source, ch) => {
    const filtered = new Float32Array(source);
    filterInPlace(filtered, shelf);
    filterInPlace(filtered, highpass);
    const weight = weightFor(ch, channels.length);
    // Prefix sums of squares make each block O(1).
    const prefix = new Float64Array(length + 1);
    for (let i = 0; i < length; i += 1) prefix[i + 1] = prefix[i]! + filtered[i]! * filtered[i]!;
    for (let b = 0; b < blockCount; b += 1) {
      const start = b * hop;
      power[b]! += (weight * (prefix[start + blockLen]! - prefix[start]!)) / blockLen;
    }
  });

  const toLufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const absoluteGate = -70;
  let sum = 0;
  let n = 0;
  for (const p of power) {
    if (p > 0 && toLufs(p) > absoluteGate) {
      sum += p;
      n += 1;
    }
  }
  if (n === 0) return -Infinity;
  const relativeGate = toLufs(sum / n) - 10;
  sum = 0;
  n = 0;
  for (const p of power) {
    if (p > 0 && toLufs(p) > relativeGate) {
      sum += p;
      n += 1;
    }
  }
  return n === 0 ? -Infinity : toLufs(sum / n);
}

/** The per-track gain that brings `lufs` to the target, clamped to a sane range. */
export function gainToTarget(lufs: number): number {
  if (!Number.isFinite(lufs)) return 0;
  return Math.max(-24, Math.min(24, Math.round((LOUDNESS_TARGET_LUFS - lufs) * 10) / 10));
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
