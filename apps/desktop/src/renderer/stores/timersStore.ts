import { useEffect, useState } from 'react';
import { create } from 'zustand';
import {
  idleRun,
  moveCounter,
  nextCounterOrder,
  pauseRun,
  remainingMs,
  settleRun,
  sortCounters,
  startRun,
  type TimerRun,
} from '@trifold/rules';
import { CAMPAIGN_SCHEMA_VERSION, errorMessage, nowIso, type CampaignTimer } from '@trifold/schema';
import { useCampaignStore } from './campaignStore';
import { useMusicStore } from './musicStore';
import { useShellStore } from './shellStore';

/**
 * The Timers dock tool (ADR 0021). Definitions (name, duration, chime, show on TV) live in the
 * open campaign's bundle and are written through the bridge straight away. Runs live here only,
 * in memory: a running timer is the moment it ends, a paused one the time it had left (see
 * `@trifold/rules` timers), so nothing drifts. Every run is dropped when the campaign changes or
 * the app restarts. A running timer also books a wake-up for its end, so reaching zero is noticed
 * (and chimes, once) even when no panel is redrawing.
 */

export interface TimerFields {
  name: string;
  durationSec: number;
  chime: boolean;
}

const NONE: readonly CampaignTimer[] = [];

/** The open campaign's timers, in list order. */
export function useTimers(): readonly CampaignTimer[] {
  return useCampaignStore((s) => s.current?.timers ?? NONE);
}

/** The clock, re-read every `everyMs` while `active`: what a countdown redraws from. */
export function useNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [active, everyMs]);
  return active ? now : Date.now();
}

function list(): readonly CampaignTimer[] {
  return useCampaignStore.getState().current?.timers ?? NONE;
}

function campaignId(): string | null {
  return useCampaignStore.getState().current?.campaign.id ?? null;
}

/** Replaces the bundle's timers, if the same campaign is still open. */
function put(owner: string, timers: readonly CampaignTimer[]): void {
  const current = useCampaignStore.getState().current;
  if (!current || current.campaign.id !== owner) return;
  useCampaignStore.setState({ current: { ...current, timers: sortCounters(timers) } });
}

interface TimersState {
  /** Runs that are not idle, by timer id. A timer with no entry is idle at its full duration. */
  runs: Record<string, TimerRun>;
  error: string | null;
  clearError(): void;
  pendingFocus: boolean;
  /** Opens the tool and asks it to focus the first timer (Ctrl+Alt+T). */
  summon(): void;
  focusTaken(): void;

  /** The run of a timer now: its entry, or idle at its full duration. */
  runOf(timer: CampaignTimer): TimerRun;
  start(id: string): void;
  pause(id: string): void;
  reset(id: string): void;
  /** Marks running timers whose moment has come as done, chiming for those that chime. */
  settle(): void;

  create(fields: TimerFields): Promise<CampaignTimer | null>;
  /** A new duration applies from the next reset; a run in progress carries on. */
  edit(id: string, fields: TimerFields): Promise<void>;
  remove(id: string): Promise<void>;
  move(id: string, index: number): Promise<void>;
  /** The TV shows one timer: putting this one on takes any other off. */
  setShowOnTv(id: string, on: boolean): Promise<void>;
  setChime(id: string, on: boolean): Promise<void>;
}

/** Wake-ups booked for running timers, by id. */
const wakeUps = new Map<string, number>();

function cancelWakeUp(id: string): void {
  const timer = wakeUps.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  wakeUps.delete(id);
}

export const useTimersStore = create<TimersState>((set, get) => {
  const fail = (err: unknown) => set({ error: errorMessage(err) });

  const setRun = (id: string, run: TimerRun | null) => {
    const runs = { ...get().runs };
    if (run) runs[id] = run;
    else delete runs[id];
    set({ runs });
  };

  const bookWakeUp = (id: string, run: TimerRun) => {
    cancelWakeUp(id);
    if (run.status !== 'running') return;
    // A few milliseconds late, so the clock is past the end when it fires.
    const delay = Math.max(0, remainingMs(run, Date.now())) + 5;
    wakeUps.set(
      id,
      window.setTimeout(() => {
        wakeUps.delete(id);
        get().settle();
      }, delay),
    );
  };

  /** Writes one timer definition and puts main's copy in the bundle. */
  const write = async (owner: string, timer: CampaignTimer) => {
    try {
      const saved = await window.trifold.timers.save(timer);
      put(
        owner,
        list().map((t) => (t.id === saved.id ? saved : t)),
      );
    } catch (err) {
      fail(err);
    }
  };

  return {
    runs: {},
    error: null,
    clearError: () => set({ error: null }),
    pendingFocus: false,
    summon() {
      useShellStore.getState().showTool('timers');
      set({ pendingFocus: true });
    },
    focusTaken: () => set({ pendingFocus: false }),

    runOf(timer) {
      return get().runs[timer.id] ?? idleRun(timer.durationSec);
    },

    start(id) {
      const timer = list().find((t) => t.id === id);
      if (!timer) return;
      const run = startRun(get().runOf(timer), timer.durationSec, Date.now());
      setRun(id, run);
      bookWakeUp(id, run);
    },

    pause(id) {
      const timer = list().find((t) => t.id === id);
      if (!timer) return;
      cancelWakeUp(id);
      const run = pauseRun(get().runOf(timer), Date.now());
      setRun(id, run);
      if (run.status === 'done' && timer.chime) useMusicStore.getState().chime();
    },

    reset(id) {
      cancelWakeUp(id);
      setRun(id, null);
    },

    settle() {
      const now = Date.now();
      const runs = { ...get().runs };
      let changed = false;
      let chime = false;
      for (const timer of list()) {
        const run = runs[timer.id];
        if (!run) continue;
        const next = settleRun(run, now);
        if (next === run) continue;
        runs[timer.id] = next;
        changed = true;
        cancelWakeUp(timer.id);
        if (timer.chime) chime = true;
      }
      if (!changed) return;
      set({ runs });
      // One chime however many timers ran out together.
      if (chime) useMusicStore.getState().chime();
    },

    async create(fields) {
      const owner = campaignId();
      if (!owner) return null;
      const at = nowIso();
      try {
        const saved = await window.trifold.timers.save({
          schemaVersion: CAMPAIGN_SCHEMA_VERSION,
          id: '',
          name: fields.name,
          durationSec: fields.durationSec,
          chime: fields.chime,
          order: nextCounterOrder(list()),
          createdAt: at,
          updatedAt: at,
        });
        put(owner, [...list().filter((t) => t.id !== saved.id), saved]);
        set({ error: null });
        return saved;
      } catch (err) {
        fail(err);
        return null;
      }
    },

    async edit(id, fields) {
      const owner = campaignId();
      const timer = list().find((t) => t.id === id);
      if (!owner || !timer) return;
      const next: CampaignTimer = { ...timer, ...fields };
      put(
        owner,
        list().map((t) => (t.id === id ? next : t)),
      );
      await write(owner, next);
    },

    async remove(id) {
      const owner = campaignId();
      if (!owner) return;
      try {
        await window.trifold.timers.remove(id);
        get().reset(id);
        put(
          owner,
          list().filter((t) => t.id !== id),
        );
        useShellStore.getState().forgetTrayItem(`timer:${id}`);
      } catch (err) {
        fail(err);
      }
    },

    async move(id, index) {
      const owner = campaignId();
      if (!owner) return;
      const changed = moveCounter(list(), id, index);
      if (!changed.length) return;
      const byId = new Map(changed.map((t) => [t.id, t]));
      put(
        owner,
        list().map((t) => byId.get(t.id) ?? t),
      );
      try {
        put(owner, await window.trifold.timers.move(id, index));
      } catch (err) {
        fail(err);
      }
    },

    async setShowOnTv(id, on) {
      const owner = campaignId();
      const timer = list().find((t) => t.id === id);
      if (!owner || !timer || !!timer.showOnTv === on) return;
      const changed: CampaignTimer[] = [];
      const next = list().map((t) => {
        const want = t.id === id ? on : on ? false : !!t.showOnTv;
        if (want === !!t.showOnTv) return t;
        const copy = { ...t };
        if (want) copy.showOnTv = true;
        else delete copy.showOnTv;
        changed.push(copy);
        return copy;
      });
      put(owner, next);
      for (const t of changed) await write(owner, t);
    },

    async setChime(id, on) {
      const owner = campaignId();
      const timer = list().find((t) => t.id === id);
      if (!owner || !timer || timer.chime === on) return;
      const next = { ...timer, chime: on };
      put(
        owner,
        list().map((t) => (t.id === id ? next : t)),
      );
      await write(owner, next);
    },
  };
});

// A different campaign (or none) starts with every timer idle.
let lastCampaign: string | null = null;
useCampaignStore.subscribe((s) => {
  const id = s.current?.campaign.id ?? null;
  if (id === lastCampaign) return;
  lastCampaign = id;
  for (const key of [...wakeUps.keys()]) cancelWakeUp(key);
  if (Object.keys(useTimersStore.getState().runs).length) useTimersStore.setState({ runs: {} });
});
