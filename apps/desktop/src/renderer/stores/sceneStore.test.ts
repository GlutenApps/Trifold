import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Scene } from '@trifold/schema';
import { useCampaignStore } from './campaignStore';
import { discardPendingSaves } from './pendingSaves';
import { useSceneStore } from './sceneStore';

/** The scene draft and the saved copy flowing back into it. */
const scene = (updatedAt: string, extra: Partial<Scene> = {}): Scene =>
  ({
    schemaVersion: 1,
    id: 's1',
    kind: 'blankGrid',
    title: 'Old bridge',
    tokens: [],
    updatedAt,
    ...extra,
  }) as Scene;

describe('scene draft', () => {
  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1' },
        scenes: [scene('2026-11-15T01:00:00.000Z')],
        sessions: [],
      } as unknown as CampaignBundle,
    });
    useSceneStore.getState().select('s1');
  });
  afterEach(() => discardPendingSaves());

  it('keeps an edit waiting to be saved when something else in the campaign is saved', () => {
    const edited = scene('2026-11-15T01:00:05.000Z', {
      fog: { enabled: true, shapes: [] },
    });
    useSceneStore.getState().setDraft(edited);
    // A session log entry lands while the scene's autosave is still waiting.
    const current = useCampaignStore.getState().current!;
    useCampaignStore.setState({ current: { ...current, sessions: [] } });
    expect(useSceneStore.getState().draft?.fog?.enabled).toBe(true);
  });

  it('takes the saved copy when nothing is waiting', () => {
    const saved = scene('2026-11-15T01:00:09.000Z', { title: 'Renamed elsewhere' });
    const current = useCampaignStore.getState().current!;
    useCampaignStore.setState({ current: { ...current, scenes: [saved] } });
    expect(useSceneStore.getState().draft?.title).toBe('Renamed elsewhere');
  });
});
