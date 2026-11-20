import { create } from 'zustand';
import type { UpdateStatus } from '@trifold/api';
import { errorMessage } from '@trifold/schema';

/**
 * The update check as the screens see it (ADR 0034, ADR 0045): main owns the check, the
 * download and the setting; this
 * mirrors the last status, read at start and refreshed by `updateStatus` events.
 */
interface UpdateState {
  status: UpdateStatus | null;
  error: string | null;
  load(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  checkNow(): Promise<void>;
  dismiss(): Promise<void>;
  openDownload(): Promise<void>;
  /** Restart to update (ADR 0045); the app closes and relaunches when the installer starts. */
  restartToUpdate(): Promise<void>;
  receive(status: UpdateStatus): void;
}

export const useUpdateStore = create<UpdateState>((set) => {
  const run = async (task: () => Promise<UpdateStatus>) => {
    try {
      set({ status: await task(), error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  };
  return {
    status: null,
    error: null,
    load: () => run(() => window.trifold.updates.status()),
    setEnabled: (enabled) => run(() => window.trifold.updates.setEnabled(enabled)),
    checkNow: () => run(() => window.trifold.updates.checkNow()),
    dismiss: () => run(() => window.trifold.updates.dismiss()),
    async openDownload() {
      try {
        await window.trifold.updates.openDownload();
      } catch (err) {
        set({ error: errorMessage(err) });
      }
    },
    async restartToUpdate() {
      try {
        const started = await window.trifold.updates.restartToUpdate();
        if (!started) set({ error: 'The update could not be installed. Try Check now.' });
      } catch (err) {
        set({ error: errorMessage(err) });
      }
    },
    receive: (status) => set({ status }),
  };
});
