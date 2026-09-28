import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useShellStore } from '../../stores/shellStore';

/**
 * One campaign at a time (ADR 0004, Decision 2). Closing while a scene is on the TV or a fight
 * is running asks first; "Stop sharing and close" blacks out the TV and leaves the fight.
 */

let pending: (() => Promise<void>) | null = null;

export function somethingLive(): boolean {
  const presenter = usePresenterStore.getState().state;
  const combat = useCombatStore.getState().state;
  return (!!presenter.scene && !presenter.blackout) || !!combat;
}

async function stopSharing(): Promise<void> {
  const presenter = usePresenterStore.getState();
  if (presenter.state.scene && !presenter.state.blackout) presenter.toggleBlackout();
  if (useCombatStore.getState().state) useCombatStore.getState().leave();
}

/** Runs `action` now, or after the DM confirms the stop-sharing warning. */
function guarded(action: () => Promise<void>): void {
  if (!somethingLive()) {
    void action();
    return;
  }
  pending = action;
  useShellStore.getState().setClosePrompt(true);
}

export function confirmClose(): void {
  const action = pending;
  pending = null;
  useShellStore.getState().setClosePrompt(false);
  void stopSharing().then(() => action?.());
}

export function cancelClose(): void {
  pending = null;
  useShellStore.getState().setClosePrompt(false);
}

export function closeCampaign(): void {
  guarded(() => useCampaignStore.getState().close());
}

/** Deletes a campaign; the open one goes through the same stop-sharing warning as closing. */
export function deleteCampaign(campaignId: string, slug: string): void {
  const run = async () => {
    if (await useCampaignStore.getState().remove(campaignId)) {
      useShellStore.getState().forgetConsole(slug);
    }
  };
  if (useCampaignStore.getState().current?.campaign.id === campaignId) guarded(run);
  else void run();
}

export function switchCampaign(campaignId: string): void {
  const current = useCampaignStore.getState().current;
  if (current?.campaign.id === campaignId) {
    useShellStore.getState().enterConsole(current.campaign.slug);
    return;
  }
  guarded(async () => {
    if (current) await useCampaignStore.getState().close();
    await useCampaignStore.getState().open(campaignId);
  });
}
