import { describe, expect, it } from 'vitest';
import { waitsForRole } from './session';

/** The first-run choice (ADR 0077): which Libraries wait for it. */

describe('waitsForRole', () => {
  const fresh = { askRole: true, role: null, sampleAdded: false, campaigns: 0 } as const;

  it('asks a new Library while player mode is on', () => {
    expect(waitsForRole(fresh)).toBe(true);
  });

  it('never asks with player mode off, or a Library already used or answered', () => {
    expect(waitsForRole({ ...fresh, askRole: false })).toBe(false);
    expect(waitsForRole({ ...fresh, role: 'gm' })).toBe(false);
    expect(waitsForRole({ ...fresh, role: 'player' })).toBe(false);
    expect(waitsForRole({ ...fresh, sampleAdded: true })).toBe(false);
    expect(waitsForRole({ ...fresh, campaigns: 1 })).toBe(false);
  });
});
