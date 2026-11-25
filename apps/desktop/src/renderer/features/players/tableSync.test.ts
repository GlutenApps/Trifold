import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, TableStatus } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { installTableSync, useTableStore } from '../../stores/tableStore';
import { fogMapJpeg } from './fogImage';

/**
 * The console keeping the table fed (ADR 0043): it must not depend on painting, because a covered
 * or minimized console does not paint, and a map image that failed to draw is tried again.
 */

vi.mock('./fogImage', () => ({ fogMapJpeg: vi.fn() }));

const T = '2026-01-01T00:00:00.000Z';
const map: Scene = {
  schemaVersion: 1,
  id: 's1',
  kind: 'map',
  title: 'Bridge',
  subtitle: '',
  showTitleOverride: null,
  parentId: null,
  order: 0,
  notes: '',
  tokens: [],
  entryMarkers: [],
  playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
  image: { path: 'images/a.png', displayPath: 'images/a.display.jpg', width: 1000, height: 800 },
  createdAt: T,
  updatedAt: T,
} as unknown as Scene;

const on = {
  state: 'on',
  campaignId: 'c',
  port: 8130,
  urls: ['http://192.168.1.2:8130'],
  localUrl: null,
  devices: [],
  connections: 0,
  anyConnected: false,
  startedAt: T,
  error: null,
} as unknown as TableStatus;

/** Lets the promise callbacks queued so far run. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('feeding the table', () => {
  let off: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    // No frames at all, as in a covered or minimized window.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.mocked(window.trifold.table.push).mockClear();
    vi.mocked(window.trifold.table.setMapImage).mockClear();
    vi.mocked(window.trifold.app.reportError).mockClear();
    vi.mocked(fogMapJpeg).mockReset();
    // Main says the table is on whenever the console asks.
    vi.mocked(window.trifold.table.status).mockResolvedValue(on);
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c', slug: 'g', name: 'G', settings: { tokenStyle: 'engraved' } },
        pcs: [],
        npcs: [],
        scenes: [map],
      } as unknown as CampaignBundle,
    });
    usePresenterStore.getState().showScene(map, 'g');
    // Live on the TV: phones follow the TV's map.
    usePresenterStore.getState().setLive(true);
    useTableStore.setState({ status: null });
  });

  afterEach(() => {
    off();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('pushes the table even when the console paints no frames', async () => {
    vi.mocked(fogMapJpeg).mockResolvedValue(new Uint8Array([1, 2, 3]));
    off = installTableSync();
    useTableStore.setState({ status: on });
    useTableStore.getState().receive(on);
    expect(window.trifold.table.push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    await flush();
    expect(window.trifold.table.push).toHaveBeenCalled();
    expect(window.trifold.table.setMapImage).toHaveBeenCalledWith(
      's1',
      expect.any(String),
      new Uint8Array([1, 2, 3]),
    );
  });

  it('tries a map image that failed to draw again, and says so in the log', async () => {
    vi.mocked(fogMapJpeg)
      .mockRejectedValueOnce(new Error('could not load the map'))
      .mockResolvedValue(new Uint8Array([9]));
    off = installTableSync();
    useTableStore.getState().receive(on);
    vi.advanceTimersByTime(150);
    await flush();
    expect(window.trifold.table.setMapImage).not.toHaveBeenCalled();
    expect(window.trifold.app.reportError).toHaveBeenCalledWith(
      'table map image',
      'could not load the map (attempt 1)',
    );
    // Nothing else changes, and still it comes: the retry asks for a push after a pause.
    vi.advanceTimersByTime(1200);
    await flush();
    expect(window.trifold.table.setMapImage).toHaveBeenCalledWith(
      's1',
      expect.any(String),
      new Uint8Array([9]),
    );
  });
});
