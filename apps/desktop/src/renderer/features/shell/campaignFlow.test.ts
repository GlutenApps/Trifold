import { initialPresenterState } from '@trifold/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useShellStore } from '../../stores/shellStore';
import { cancelClose, closeCampaign, confirmClose, somethingLive } from './campaignFlow';

const liveTitle = () =>
  usePresenterStore.setState({
    state: {
      ...initialPresenterState,
      blackout: false,
      scene: { kind: 'title', id: 's1', title: 'Act one' },
    },
  });

describe('campaignFlow', () => {
  beforeEach(() => {
    usePresenterStore.setState({ state: { ...initialPresenterState } });
    useCombatStore.setState({ state: null });
    useShellStore.setState({ closePrompt: false });
    useCampaignStore.setState({ close: vi.fn(async () => undefined) });
  });

  it('nothing is live when the TV is blacked out and no fight runs', () => {
    expect(somethingLive()).toBe(false);
    liveTitle();
    expect(somethingLive()).toBe(true);
    usePresenterStore.getState().setBlackout(true);
    expect(somethingLive()).toBe(false);
  });

  it('closes at once when nothing is live', async () => {
    closeCampaign();
    await Promise.resolve();
    expect(useCampaignStore.getState().close).toHaveBeenCalledTimes(1);
    expect(useShellStore.getState().closePrompt).toBe(false);
  });

  it('asks first while a scene is on the TV, and cancel keeps everything as it was', () => {
    liveTitle();
    closeCampaign();
    expect(useShellStore.getState().closePrompt).toBe(true);
    expect(useCampaignStore.getState().close).not.toHaveBeenCalled();
    cancelClose();
    expect(useShellStore.getState().closePrompt).toBe(false);
    expect(usePresenterStore.getState().state.blackout).toBe(false);
    expect(useCampaignStore.getState().close).not.toHaveBeenCalled();
  });

  it('"Stop sharing and close" blacks out the TV before closing', async () => {
    liveTitle();
    closeCampaign();
    confirmClose();
    expect(useShellStore.getState().closePrompt).toBe(false);
    expect(usePresenterStore.getState().state.blackout).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(useCampaignStore.getState().close).toHaveBeenCalledTimes(1);
  });
});
