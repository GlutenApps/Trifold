import { create } from 'zustand';
import { CAMPAIGN_SCHEMA_VERSION, errorMessage, nowIso, type PinnedRoll } from '@trifold/schema';
import { useCampaignStore } from './campaignStore';
import type { RollLogEntry } from './rollLogStore';

/**
 * Pinned rolls: a roll from the shared log, kept in the open campaign until it is unpinned, under
 * a name the DM chooses. The pins live in the campaign bundle and every change is written through
 * the bridge straight away. Which log entry a pin came from is remembered for this session only,
 * so the log can show the pin as on; the log itself is never written.
 */

const NONE: readonly PinnedRoll[] = [];

/** The open campaign's pinned rolls, in the order they were pinned. */
export function usePinnedRolls(): readonly PinnedRoll[] {
  return useCampaignStore((s) => s.current?.pinnedRolls ?? NONE);
}

function owner(): string | null {
  return useCampaignStore.getState().current?.campaign.id ?? null;
}

/** Applies a change to the bundle's pins, if the same campaign is still open. */
function update(campaignId: string, change: (pins: readonly PinnedRoll[]) => PinnedRoll[]): void {
  const current = useCampaignStore.getState().current;
  if (!current || current.campaign.id !== campaignId) return;
  useCampaignStore.setState({
    current: { ...current, pinnedRolls: change(current.pinnedRolls ?? NONE) },
  });
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
        const saved = await window.trifold.pinnedRolls.save({
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
      const pin = useCampaignStore.getState().current?.pinnedRolls?.find((p) => p.id === id);
      const trimmed = name.trim();
      if (!campaignId || !pin || !trimmed || trimmed === pin.name) return;
      // Shown at once; the written copy replaces it when it comes back.
      update(campaignId, (pins) => pins.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
      try {
        const saved = await window.trifold.pinnedRolls.save({ ...pin, name: trimmed });
        update(campaignId, (pins) => pins.map((p) => (p.id === id ? saved : p)));
      } catch (err) {
        update(campaignId, (pins) => pins.map((p) => (p.id === id ? pin : p)));
        fail(err);
      }
    },

    async unpin(id) {
      const campaignId = owner();
      if (!campaignId) return;
      try {
        await window.trifold.pinnedRolls.remove(id);
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
