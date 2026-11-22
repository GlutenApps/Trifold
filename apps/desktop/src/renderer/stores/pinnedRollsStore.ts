import { create } from 'zustand';
import { CAMPAIGN_SCHEMA_VERSION, errorMessage, nowIso, type PinnedRoll } from '@trifold/schema';
import { useCampaignStore } from './campaignStore';
import { useJoinedStore } from './joinedStore';
import type { RollLogEntry } from './rollLogStore';

/**
 * Pinned rolls: a roll from the shared log, kept in the open campaign until it is unpinned, under
 * a name the DM chooses. The pins live in the campaign bundle and every change is written through
 * the bridge straight away. Which log entry a pin came from is remembered for this session only,
 * so the log can show the pin as on; the log itself is never written.
 *
 * A player's pins work the same way in a joined campaign (docs/PLAYER-MODE.md, "Panels"): they
 * are the player's own, kept in `joined/<id>/pinnedRolls/` and held by the joined store.
 */

const NONE: readonly PinnedRoll[] = [];

/** Where the open campaign's pins are held and written: a campaign this Library runs, or joined. */
interface PinHome {
  id: string;
  pins: readonly PinnedRoll[];
  show(pins: PinnedRoll[]): void;
  save(pin: PinnedRoll): Promise<PinnedRoll>;
  remove(id: string): Promise<void>;
}

function home(): PinHome | null {
  const running = useCampaignStore.getState().current;
  if (running) {
    return {
      id: running.campaign.id,
      pins: running.pinnedRolls ?? NONE,
      show(pins) {
        const current = useCampaignStore.getState().current;
        if (current) useCampaignStore.setState({ current: { ...current, pinnedRolls: pins } });
      },
      save: (pin) => window.trifold.pinnedRolls.save(pin),
      remove: (id) => window.trifold.pinnedRolls.remove(id),
    };
  }
  const joined = useJoinedStore.getState();
  const campaignId = joined.current?.campaignId;
  if (!campaignId) return null;
  return {
    id: campaignId,
    pins: joined.pins,
    show: (pins) => useJoinedStore.getState().setPins(campaignId, pins),
    save: (pin) => window.trifold.joined.savePinnedRoll(campaignId, pin),
    remove: (id) => window.trifold.joined.removePinnedRoll(campaignId, id),
  };
}

/** The open campaign's pinned rolls, in the order they were pinned. */
export function usePinnedRolls(): readonly PinnedRoll[] {
  const running = useCampaignStore((s) => s.current?.pinnedRolls);
  const joined = useJoinedStore((s) => (s.current ? s.pins : undefined));
  return running ?? joined ?? NONE;
}

/** Whether there is a campaign, run or joined, to pin a roll into. */
export function useCanPin(): boolean {
  const running = useCampaignStore((s) => !!s.current);
  const joined = useJoinedStore((s) => !!s.current);
  return running || joined;
}

function owner(): string | null {
  return home()?.id ?? null;
}

/** Applies a change to the open campaign's pins, if the same campaign is still open. */
function update(campaignId: string, change: (pins: readonly PinnedRoll[]) => PinnedRoll[]): void {
  const at = home();
  if (at?.id === campaignId) at.show(change(at.pins));
}

interface PinnedRollsState {
  /** Log entry id → pin id, for the entries pinned this session. */
  fromLog: Record<string, string>;
  /** The pin whose name field should open, set when a roll has just been pinned. */
  naming: string | null;
  error: string | null;
  clearError(): void;
  namingDone(): void;
  pin(entry: RollLogEntry): Promise<PinnedRoll | null>;
  rename(id: string, name: string): Promise<void>;
  unpin(id: string): Promise<void>;
}

/** Log entries being pinned right now, so a second click or Enter cannot pin one twice. */
const inFlight = new Set<string>();

export const usePinnedRollsStore = create<PinnedRollsState>((set, get) => {
  const fail = (err: unknown) => set({ error: errorMessage(err) });
  return {
    fromLog: {},
    naming: null,
    error: null,
    clearError: () => set({ error: null }),
    namingDone: () => set({ naming: null }),

    async pin(entry) {
      const campaignId = owner();
      if (!campaignId || inFlight.has(entry.id) || get().fromLog[entry.id]) return null;
      inFlight.add(entry.id);
      const at = nowIso();
      try {
        const saved = await home()!.save({
          schemaVersion: CAMPAIGN_SCHEMA_VERSION,
          id: '',
          name: entry.label,
          label: entry.label,
          expression: entry.expression,
          total: entry.total,
          faces: entry.faces,
          kind: entry.kind,
          source: entry.source,
          ...(entry.actor ? { actor: entry.actor } : {}),
          ...(entry.outcome ? { outcome: entry.outcome } : {}),
          rolledAt: new Date(entry.at).toISOString(),
          createdAt: at,
          updatedAt: at,
        });
        update(campaignId, (pins) => [...pins, saved]);
        set({ fromLog: { ...get().fromLog, [entry.id]: saved.id }, naming: saved.id, error: null });
        return saved;
      } catch (err) {
        fail(err);
        return null;
      } finally {
        inFlight.delete(entry.id);
      }
    },

    async rename(id, name) {
      const campaignId = owner();
      const at = home();
      const pin = at?.pins.find((p) => p.id === id);
      const trimmed = name.trim();
      if (!campaignId || !at || !pin || !trimmed || trimmed === pin.name) return;
      // Shown at once; the written copy replaces it when it comes back.
      update(campaignId, (pins) => pins.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
      try {
        const saved = await at.save({ ...pin, name: trimmed });
        update(campaignId, (pins) => pins.map((p) => (p.id === id ? saved : p)));
      } catch (err) {
        update(campaignId, (pins) => pins.map((p) => (p.id === id ? pin : p)));
        fail(err);
      }
    },

    async unpin(id) {
      const at = home();
      const campaignId = at?.id;
      if (!at || !campaignId) return;
      try {
        await at.remove(id);
        update(campaignId, (pins) => pins.filter((p) => p.id !== id));
        const fromLog = Object.fromEntries(
          Object.entries(get().fromLog).filter(([, pinId]) => pinId !== id),
        );
        set({ fromLog, naming: get().naming === id ? null : get().naming });
      } catch (err) {
        fail(err);
      }
    },
  };
});
