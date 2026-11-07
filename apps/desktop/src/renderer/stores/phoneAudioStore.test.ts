import { describe, expect, it } from 'vitest';
import { mergePhones } from './phoneAudioStore';

describe('mergePhones', () => {
  it('puts remembered phones first in their order, then the rest by name', () => {
    const rows = mergePhones(
      {
        supported: true,
        state: 'off',
        device: null,
        detail: null,
        source: 'computer',
        remembered: [
          { id: 'b', name: 'Pixel', lastConnectedAt: '2026-11-06T10:00:00.000Z' },
          { id: 'gone', name: 'Old phone', lastConnectedAt: '2026-10-01T10:00:00.000Z' },
        ],
      },
      [
        { id: 'z', name: 'Zed' },
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Pixel' },
      ],
    );
    expect(rows).toEqual([
      { id: 'b', name: 'Pixel', remembered: true, paired: true },
      { id: 'gone', name: 'Old phone', remembered: true, paired: false },
      { id: 'a', name: 'Alpha', remembered: false, paired: true },
      { id: 'z', name: 'Zed', remembered: false, paired: true },
    ]);
  });
});
