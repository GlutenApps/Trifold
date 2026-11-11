import { create } from 'zustand';
import {
  applyCounterFields,
  canShowOnTv,
  moveCounter,
  nextCounterOrder,
  setCounterValue,
  sortCounters,
  type CounterChange,
  type CounterFields,
} from '@trifold/rules';
import {
  CAMPAIGN_SCHEMA_VERSION,
  errorMessage,
  nowIso,
  type CampaignCounter,
} from '@trifold/schema';
import { useCampaignStore } from './campaignStore';
import { cancelSave, flushSave, scheduleSave } from './pendingSaves';
import { useShellStore } from './shellStore';

/**
 * The Counters dock tool's actions (ADR 0019). The counters themselves live in the open
 * campaign's bundle (`useCampaignStore`), which stays their one owner; this store changes them
 * there and writes them through the bridge. Value changes show at once and are written once the
 * DM stops clicking (`VALUE_SAVE_MS`), so a burst of presses is one file write; the shared
 * pending-saves queue writes a waiting one before a backup, a campaign switch or quitting.
 * Everything else (create, edit, delete, reorder) is written straight away. `error` is shown as
 * a banner in the tool.
 */
export const VALUE_SAVE_MS = 300;

export const counterSlot = (id: string) => `counter:${id}`;

const NONE: readonly CampaignCounter[] = [];

/** The open campaign's counters, in list order. */
export function useCounters(): readonly CampaignCounter[] {
  return useCampaignStore((s) => s.current?.counters ?? NONE);
}

function list(): readonly CampaignCounter[] {
  return useCampaignStore.getState().current?.counters ?? NONE;
}

/** Replaces the bundle's counters, if the same campaign is still open. */
function put(campaignId: string, counters: readonly CampaignCounter[]): void {
  const current = useCampaignStore.getState().current;
  if (!current || current.campaign.id !== campaignId) return;
  useCampaignStore.setState({ current: { ...current, counters: sortCounters(counters) } });
}

function campaignId(): string | null {
  return useCampaignStore.getState().current?.campaign.id ?? null;
}

interface CountersState {
  error: string | null;
  clearError(): void;
  /** Set by `summon`: the tool focuses its first counter (or New counter) once on screen. */
  pendingFocus: boolean;
  /** Opens the tool, in the dock or as a flyout, and asks it to take the focus (Ctrl+Alt+C). */
  summon(): void;
  focusTaken(): void;
  /** Makes a counter at its initial value, last in the list. */
  create(fields: CounterFields): Promise<CampaignCounter | null>;
  /** New name, bounds or step; the value is kept, pulled inside the new bounds. */
  edit(id: string, fields: CounterFields): Promise<void>;
  /** Asks for a value; it is clamped, shown at once and saved shortly. */
  setValue(id: string, wanted: number): CounterChange | null;
  adjust(id: string, delta: number): CounterChange | null;
  /** Back to the initial value. */
  reset(id: string): CounterChange | null;
  remove(id: string): Promise<void>;
  /** Puts a counter on the TV or takes it off; the TV shows at most three. */
  setShowOnTv(id: string, on: boolean): Promise<void>;
  /** Puts a counter at `index` among the others. */
  move(id: string, index: number): Promise<void>;
}

export const useCountersStore = create<CountersState>((set, get) => {
  const fail = (err: unknown) => set({ error: errorMessage(err) });

  /** Writes one counter as it is in the bundle now. */
  const write = async (owner: string, id: string) => {
    const counter = list().find((c) => c.id === id);
    if (!counter || campaignId() !== owner) return;
    try {
      await window.trifold.counters.save(counter);
    } catch (err) {
      fail(err);
    }
  };

  return {
    error: null,
    clearError: () => set({ error: null }),
    pendingFocus: false,
    summon() {
      useShellStore.getState().showTool('counters');
      set({ pendingFocus: true });
    },
    focusTaken: () => set({ pendingFocus: false }),

    async create(fields) {
      const owner = campaignId();
      if (!owner) return null;
      const at = nowIso();
      const draft: CampaignCounter = applyCounterFields(
        {
          schemaVersion: CAMPAIGN_SCHEMA_VERSION,
          id: '',
          name: fields.name,
          initial: fields.initial,
          value: fields.initial,
          step: fields.step,
          order: nextCounterOrder(list()),
          createdAt: at,
          updatedAt: at,
        },
        fields,
      );
      try {
        const saved = await window.trifold.counters.save(draft);
        put(owner, [...list().filter((c) => c.id !== saved.id), saved]);
        set({ error: null });
        return saved;
      } catch (err) {
        fail(err);
        return null;
      }
    },

    async edit(id, fields) {
      const owner = campaignId();
      const counter = list().find((c) => c.id === id);
      if (!owner || !counter) return;
      const next = applyCounterFields(counter, fields);
      cancelSave(counterSlot(id));
      put(
        owner,
        list().map((c) => (c.id === id ? next : c)),
      );
      try {
        const saved = await window.trifold.counters.save(next);
        // A press while the edit was on its way wins over the saved value.
        put(
          owner,
          list().map((c) => (c.id === id ? { ...saved, value: c.value } : c)),
        );
      } catch (err) {
        fail(err);
      }
    },

    setValue(id, wanted) {
      const owner = campaignId();
      const counter = list().find((c) => c.id === id);
      if (!owner || !counter) return null;
      const change = setCounterValue(counter, wanted);
      if (change.value !== counter.value) {
        put(
          owner,
          list().map((c) => (c.id === id ? { ...c, value: change.value } : c)),
        );
        scheduleSave(counterSlot(id), () => write(owner, id), VALUE_SAVE_MS);
      }
      return change;
    },

    adjust(id, delta) {
      const counter = list().find((c) => c.id === id);
      return counter ? get().setValue(id, counter.value + delta) : null;
    },

    reset(id) {
      const counter = list().find((c) => c.id === id);
      return counter ? get().setValue(id, counter.initial) : null;
    },

    async remove(id) {
      const owner = campaignId();
      if (!owner) return;
      cancelSave(counterSlot(id));
      try {
        await window.trifold.counters.remove(id);
        put(
          owner,
          list().filter((c) => c.id !== id),
        );
        useShellStore.getState().forgetTrayItem(`counter:${id}`);
      } catch (err) {
        fail(err);
      }
    },

    async setShowOnTv(id, on) {
      const owner = campaignId();
      const counter = list().find((c) => c.id === id);
      if (!owner || !counter || !!counter.showOnTv === on) return;
      if (on && !canShowOnTv(list(), id)) return;
      const next = { ...counter };
      if (on) next.showOnTv = true;
      else delete next.showOnTv;
      // The whole counter is written now, so a value still waiting goes with it.
      cancelSave(counterSlot(id));
      put(
        owner,
        list().map((c) => (c.id === id ? next : c)),
      );
      try {
        await window.trifold.counters.save(next);
      } catch (err) {
        fail(err);
      }
    },

    async move(id, index) {
      const owner = campaignId();
      if (!owner) return;
      const changed = moveCounter(list(), id, index);
      if (!changed.length) return;
      const byId = new Map(changed.map((c) => [c.id, c]));
      put(
        owner,
        list().map((c) => byId.get(c.id) ?? c),
      );
      // Values still waiting to be written go first: main rewrites the files it renumbers.
      await Promise.all(list().map((c) => flushSave(counterSlot(c.id))));
      try {
        const saved = await window.trifold.counters.move(id, index);
        // Keep values the DM changed while the move was on its way.
        const live = new Map(list().map((c) => [c.id, c.value]));
        put(
          owner,
          saved.map((c) => ({ ...c, value: live.get(c.id) ?? c.value })),
        );
      } catch (err) {
        fail(err);
      }
    },
  };
});
