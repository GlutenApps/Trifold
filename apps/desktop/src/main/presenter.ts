import { EVENT_CHANNELS, initialPresenterState, type PresenterState } from '@trifold/api';
import type { WindowManager } from './windows';

/**
 * Relay for presenter state (DESIGN.md §4.1): the console owns the state, main keeps the latest
 * copy and re-broadcasts it to the player window, which only renders it.
 */
export class PresenterHub {
  private state: PresenterState = initialPresenterState;

  constructor(private readonly windows: WindowManager) {}

  push(state: PresenterState): void {
    if (state.updatedAt < this.state.updatedAt) return;
    this.state = state;
    this.windows.sendToPlayer(EVENT_CHANNELS.presenterState, state);
  }

  get(): PresenterState {
    return this.state;
  }

  /** Called when the player window finishes loading so it starts from the live state. */
  sync(): void {
    this.windows.sendToPlayer(EVENT_CHANNELS.presenterState, this.state);
  }
}
