import { create } from 'zustand';
import type { PhoneAudioDevice, PhoneAudioStatus } from '@trifold/api';

/**
 * The phone audio receiver (ADR 0007) as the renderer sees it. Main owns the connection and the
 * remembered phones; this store mirrors its `phoneAudioStatus` events and the answers to its
 * calls, and holds the last device listing. Nothing persists from here; `load()` subscribes
 * once per session and is safe to call from every mount.
 */
export type PhoneRow = PhoneAudioDevice & {
  /** Connected before, so it shows first and connects in one click. */
  remembered: boolean;
  /** Paired right now; a remembered phone that was unpaired stays listed but cannot connect. */
  paired: boolean;
};

/** Remembered phones first (most recent first), then the other paired ones, by name. */
export function mergePhones(status: PhoneAudioStatus, paired: PhoneAudioDevice[]): PhoneRow[] {
  const pairedIds = new Set(paired.map((d) => d.id));
  const remembered = status.remembered.map((d) => ({
    id: d.id,
    name: d.name,
    remembered: true,
    paired: pairedIds.has(d.id),
  }));
  const rememberedIds = new Set(remembered.map((d) => d.id));
  const others = paired
    .filter((d) => !rememberedIds.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ ...d, remembered: false, paired: true }));
  return [...remembered, ...others];
}

interface PhoneAudioState {
  status: PhoneAudioStatus;
  paired: PhoneAudioDevice[];
  /** A listing is running (PowerShell takes a second or two). */
  searching: boolean;
  error: string | null;
  load(): Promise<void>;
  refresh(): Promise<void>;
  connect(device: PhoneAudioDevice): Promise<void>;
  disconnect(): Promise<void>;
  forget(deviceId: string): Promise<void>;
}

const OFF: PhoneAudioStatus = {
  supported: false,
  state: 'off',
  device: null,
  detail: null,
  remembered: [],
  source: 'computer',
};

let listening = false;

export const usePhoneAudioStore = create<PhoneAudioState>((set, get) => {
  const fail = (err: unknown) => set({ error: err instanceof Error ? err.message : String(err) });
  return {
    status: OFF,
    paired: [],
    searching: false,
    error: null,

    async load() {
      if (!listening && typeof window.trifold?.on === 'function') {
        listening = true;
        window.trifold.on('phoneAudioStatus', (status) => set({ status }));
      }
      try {
        set({ status: await window.trifold.phoneAudio.status(), error: null });
      } catch (err) {
        fail(err);
      }
    },

    async refresh() {
      if (get().searching) return;
      set({ searching: true });
      try {
        set({ paired: await window.trifold.phoneAudio.listDevices(), error: null });
      } catch (err) {
        fail(err);
      } finally {
        set({ searching: false });
      }
    },

    async connect(device) {
      try {
        set({ status: await window.trifold.phoneAudio.connect(device), error: null });
      } catch (err) {
        fail(err);
      }
    },

    async disconnect() {
      try {
        set({ status: await window.trifold.phoneAudio.disconnect() });
      } catch (err) {
        fail(err);
      }
    },

    async forget(deviceId) {
      try {
        set({ status: await window.trifold.phoneAudio.forget(deviceId) });
      } catch (err) {
        fail(err);
      }
    },
  };
});
