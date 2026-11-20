import { errorMessage } from '@trifold/schema';
import { useAppStore } from './appStore';
import { usePresenterStore } from './presenterStore';
import { playSceneMusic } from './sceneStore';

/**
 * Going live (ADR 0046): one switch for the table's output. Going live opens the TV on a second
 * display (or the one chosen in Settings) and lets phones see the table; the active scene shows
 * on both and its music starts. Ending it closes the TV and phones wait. The active scene stays
 * set either way, so a DM can set the opening scene and go live when the table is ready.
 */
export async function goLive(): Promise<void> {
  const presenter = usePresenterStore.getState();
  if (presenter.state.live) return;
  presenter.setLive(true);
  const active = usePresenterStore.getState().liveSource?.scene;
  if (active && usePresenterStore.getState().state.scene?.id === active.id) playSceneMusic(active);
  try {
    const open = await window.trifold.player.openForLive();
    useAppStore.getState().setPlayerOpen(open);
  } catch (err) {
    useAppStore.setState({ error: errorMessage(err) });
  }
}

export async function endLive(): Promise<void> {
  usePresenterStore.getState().setLive(false);
  await useAppStore.getState().closePlayer();
}

/** Go live, or end it (`Ctrl+Shift+P`). */
export function toggleLive(): Promise<void> {
  return usePresenterStore.getState().state.live ? endLive() : goLive();
}
