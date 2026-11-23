import { create } from 'zustand';
import {
  CAMPAIGN_SCHEMA_VERSION,
  errorMessage,
  nowIso,
  type Note,
  type PinnedRoll,
} from '@trifold/schema';
import type { FoundTableSummary, JoinedSummary, TablePeekResult } from '@trifold/api';
import { useAppStore } from './appStore';
import { useCampaignStore } from './campaignStore';
import { useCombatStore } from './combatStore';
import { usePresenterStore } from './presenterStore';
import { useShellStore } from './shellStore';

/**
 * Joined campaigns (docs/PLAYER-MODE.md): the campaigns this Library plays in, and the tables
 * Join a campaign has found on the local network. Main owns the files and the search; this
 * store keeps what main says and asks it to act. The search runs only between `startSearch` and
 * `stopSearch`, which the Join a campaign panel calls as it opens and closes.
 */
interface JoinedState {
  joined: JoinedSummary[];
  /** The joined campaign whose player console is loaded; null when none is. */
  current: JoinedSummary | null;
  /**
   * The open joined campaign's own files, the player's and nobody else's: quick notes, newest
   * first, and pinned rolls. Empty when none is open. They never go to the GM's table.
   */
  notes: Note[];
  pins: PinnedRoll[];
  /** How many records the open joined campaign's GM shares with it (ADR 0060). */
  sharedRecords: number;
  /** Of those, how many step aside for the player's own copies. */
  ownCopies: number;
  tables: FoundTableSummary[];
  searching: boolean;
  error: string | null;

  load(): Promise<void>;
  startSearch(): Promise<void>;
  stopSearch(): Promise<void>;
  /** Asks a typed address which campaign it is. */
  peek(address: string): Promise<TablePeekResult>;
  /**
   * Opens a player pack (ADR 0064): joins its campaign if this Library has not, and keeps its
   * shared content. Resolves to the problem, or null when it worked.
   */
  openPack(path: string, displayName: string): Promise<string | null>;
  /** Joins the campaign at a table. Resolves to whether it worked. */
  join(table: FoundTableSummary, displayName: string): Promise<boolean>;
  leave(campaignId: string): Promise<void>;
  /**
   * Opens a joined campaign's player console, or goes back to it when it is the open one. A
   * campaign this Library is running is closed first, unless something of it is live.
   */
  openCampaign(campaignId: string): Promise<void>;
  /** Closes the player console; the connection to the table goes with it. */
  closeCampaign(): void;
  /** Saves a new quick note in the open joined campaign. */
  captureNote(title: string, body: string): Promise<Note | null>;
  saveNote(note: Note): Promise<Note | null>;
  removeNote(id: string): Promise<void>;
  /** The pinned-rolls store's way to show a change it has saved. */
  setPins(campaignId: string, pins: PinnedRoll[]): void;
  clearError(): void;
}

let stopListening: (() => void) | null = null;

/** A failure inside the player console shows where the console's other failures do. */
const fail = (err: unknown) => useAppStore.setState({ error: errorMessage(err) });

const newestFirst = (notes: Note[]) =>
  notes.sort((a, b) => (b.capture?.at ?? b.createdAt).localeCompare(a.capture?.at ?? a.createdAt));

export const useJoinedStore = create<JoinedState>((set, get) => ({
  joined: [],
  current: null,
  notes: [],
  pins: [],
  sharedRecords: 0,
  ownCopies: 0,
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

  async openPack(path, displayName) {
    try {
      const result = await window.trifold.joined.openPack(path, displayName);
      if (!result.ok) return result.message;
      await get().load();
      return null;
    } catch (err) {
      return errorMessage(err);
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

  async openCampaign(campaignId) {
    const shell = useShellStore.getState();
    if (get().current?.campaignId === campaignId) {
      shell.enterPlayerConsole(campaignId);
      return;
    }
    const joined = get().joined.find((j) => j.campaignId === campaignId);
    if (!joined) return;
    const running = useCampaignStore.getState();
    if (running.current) {
      const presenter = usePresenterStore.getState().state;
      const live = (!!presenter.scene && !presenter.blackout) || !!useCombatStore.getState().state;
      if (live) {
        set({ error: `Close ${running.current.campaign.name} first: it has something live.` });
        return;
      }
      await running.close();
    }
    set({ current: joined, notes: [], pins: [], sharedRecords: 0, error: null });
    shell.enterPlayerConsole(campaignId);
    try {
      const [notes, pins] = await Promise.all([
        window.trifold.joined.notes(campaignId),
        window.trifold.joined.pinnedRolls(campaignId),
      ]);
      if (get().current?.campaignId === campaignId) set({ notes, pins });
    } catch (err) {
      fail(err);
    }
  },

  closeCampaign() {
    if (!get().current) return;
    set({ current: null, notes: [], pins: [], sharedRecords: 0 });
    useShellStore.getState().leaveCampaign();
  },

  async leave(campaignId) {
    if (get().current?.campaignId === campaignId) get().closeCampaign();
    try {
      await window.trifold.joined.leave(campaignId);
      await get().load();
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  async captureNote(title, body) {
    const at = nowIso();
    return get().saveNote({
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: '',
      kind: 'note',
      title,
      body,
      tags: [],
      links: [],
      parentId: null,
      order: 0,
      capture: { at },
      createdAt: at,
      updatedAt: at,
    });
  },

  async saveNote(note) {
    const campaignId = get().current?.campaignId;
    if (!campaignId) return null;
    try {
      const saved = await window.trifold.joined.saveNote(campaignId, note);
      if (get().current?.campaignId === campaignId) {
        set({ notes: newestFirst([...get().notes.filter((n) => n.id !== saved.id), saved]) });
      }
      return saved;
    } catch (err) {
      // A draft that flushes after the campaign closed or was left has nowhere to go.
      if (get().current?.campaignId === campaignId) fail(err);
      return null;
    }
  },

  async removeNote(id) {
    const campaignId = get().current?.campaignId;
    if (!campaignId) return;
    try {
      await window.trifold.joined.removeNote(campaignId, id);
      if (get().current?.campaignId === campaignId) {
        set({ notes: get().notes.filter((n) => n.id !== id) });
      }
    } catch (err) {
      fail(err);
    }
  },

  setPins(campaignId, pins) {
    if (get().current?.campaignId === campaignId) set({ pins });
  },

  clearError() {
    set({ error: null });
  },
}));
