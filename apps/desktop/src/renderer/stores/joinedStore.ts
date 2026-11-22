import { create } from 'zustand';
import { errorMessage } from '@trifold/schema';
import type { FoundTableSummary, JoinedSummary, TablePeekResult } from '@trifold/api';

/**
 * Joined campaigns (docs/PLAYER-MODE.md): the campaigns this Library plays in, and the tables
 * Join a campaign has found on the local network. Main owns the files and the search; this
 * store keeps what main says and asks it to act. The search runs only between `startSearch` and
 * `stopSearch`, which the Join a campaign panel calls as it opens and closes.
 */
interface JoinedState {
  joined: JoinedSummary[];
  tables: FoundTableSummary[];
  searching: boolean;
  error: string | null;

  load(): Promise<void>;
  startSearch(): Promise<void>;
  stopSearch(): Promise<void>;
  /** Asks a typed address which campaign it is. */
  peek(address: string): Promise<TablePeekResult>;
  /** Joins the campaign at a table. Resolves to whether it worked. */
  join(table: FoundTableSummary, displayName: string): Promise<boolean>;
  leave(campaignId: string): Promise<void>;
  clearError(): void;
}

let stopListening: (() => void) | null = null;

export const useJoinedStore = create<JoinedState>((set, get) => ({
  joined: [],
  tables: [],
  searching: false,
  error: null,

  async load() {
    try {
      set({ joined: await window.trifold.joined.list() });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async startSearch() {
    if (get().searching) return;
    set({ searching: true, tables: [] });
    stopListening ??= window.trifold.on('joinedTables', (tables) => {
      if (get().searching) set({ tables });
    });
    try {
      const tables = await window.trifold.joined.startSearch();
      if (get().searching) set({ tables });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async stopSearch() {
    if (!get().searching) return;
    set({ searching: false, tables: [] });
    stopListening?.();
    stopListening = null;
    await window.trifold.joined.stopSearch().catch(() => undefined);
  },

  async peek(address) {
    try {
      return await window.trifold.joined.peek(address);
    } catch {
      return { ok: false, reason: 'noAnswer' };
    }
  },

  async join(table, displayName) {
    try {
      await window.trifold.joined.join({
        campaignId: table.campaignId,
        campaignName: table.campaignName,
        displayName,
        address: table.address,
      });
      await get().load();
      set({
        tables: get().tables.map((t) =>
          t.campaignId === table.campaignId ? { ...t, joined: true } : t,
        ),
      });
      return true;
    } catch (err) {
      set({ error: errorMessage(err) });
      return false;
    }
  },

  async leave(campaignId) {
    try {
      await window.trifold.joined.leave(campaignId);
      await get().load();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
