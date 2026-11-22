import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CreatureView, JoinedSummary, LastTableView } from '@trifold/api';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { logTableRoll, useTableRollStore } from '../../stores/tableRollStore';
import { useConnection, type Connection } from '../../../web/connection';
import { createBridgeClient, withTableUrls } from './bridgeClient';

/**
 * The open joined campaign's table, for every panel of the player console
 * (docs/PLAYER-MODE.md, "Player console"): one connection, held here above the stage, the dock
 * and the strip, so the VTT tab, My characters and Initiative all show the same view and send
 * through the same link. It lasts as long as the console is mounted, the Library included, and
 * closes when the campaign is closed.
 */
interface PlayerTable {
  campaign: JoinedSummary;
  conn: Connection;
  /**
   * The creature picked in My characters, as `kind:id`: the VTT tab frames its token and Sheets
   * shows it. Null until the player picks one; then the player's own character stands in.
   */
  selected: string | null;
  select(key: string): void;
  /**
   * While the player is not at the table: what it last showed them and when, from this run of
   * the app or from main's cache (docs/PLAYER-MODE.md, "Not live"). Read-only: nothing in it
   * can be changed until the table is back. Null at the table, and when it was never seen.
   */
  last: LastTableView | null;
}

/** A creature's key in the player console: `pc:<id>`, `npc:<id>` or `summon:<token id>`. */
export const creatureKeyOf = (c: Pick<CreatureView, 'kind' | 'id'>) => `${c.kind}:${c.id}`;

const Context = createContext<PlayerTable | null>(null);

export function PlayerTableProvider({
  campaign,
  children,
}: {
  campaign: JoinedSummary;
  children: ReactNode;
}) {
  const client = useMemo(() => createBridgeClient(campaign.campaignId), [campaign.campaignId]);
  // Rolls made at the table land in this console's roll log, the player's own among them.
  const conn = useConnection(client, { onRolled: logTableRoll });
  const { campaignId } = campaign;
  const [selected, select] = useState<string | null>(null);
  // The tracker is waiting for one of the player's creatures to roll initiative: the Initiative
  // tool comes forward, as a section or a flyout, so the box to enter it is never out of sight.
  const rollWanted = conn.link === 'open' && !!conn.view?.mine.some((c) => c.needsInitiative);
  useEffect(() => {
    if (rollWanted && useShellStore.getState().role === 'player') {
      useShellStore.getState().showTool('initiative');
    }
  }, [rollWanted]);
  // At the table and holding a character, a roll can be asked of the GM's Trifold (ADR 0059).
  // Otherwise there is nobody to ask, and every roll is private.
  const canRollAtTable = conn.link === 'open' && (conn.view?.mine.length ?? 0) > 0;
  const { send } = conn;
  useEffect(() => {
    if (!canRollAtTable) return;
    useTableRollStore.getState().setSend((expression) => send({ type: 'roll', expression }));
    return () => useTableRollStore.getState().setSend(null);
    // `send` is a new function each render and always sends through the same client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRollAtTable, client]);

  // What the GM shares arrived, changed or went (ADR 0060): the compendium's list, its source
  // filter and its counts are read again, so the player sees it without doing anything.
  useEffect(
    () =>
      window.trifold.on('joinedShared', (event) => {
        if (event.campaignId !== campaignId) return;
        useJoinedStore.setState({ sharedRecords: event.records });
        void useSourcesStore.getState().load();
        void useCompendiumStore.getState().search();
        void useCompendiumStore.getState().loadFacets();
      }),
    [campaignId],
  );

  // What the table last showed: the newest view of this run, else what main kept from the last.
  const [kept, setKept] = useState<LastTableView | null>(null);
  const [seen, setSeen] = useState<LastTableView | null>(null);
  useEffect(() => {
    let wanted = true;
    void window.trifold.joined
      .lastView(campaignId)
      .then((last) => {
        if (wanted && last) setKept({ view: withTableUrls(last.view, campaignId), at: last.at });
      })
      .catch(() => undefined);
    return () => {
      wanted = false;
    };
  }, [campaignId]);
  useEffect(() => {
    if (conn.view) setSeen({ view: conn.view, at: new Date().toISOString() });
  }, [conn.view]);
  const last = conn.link === 'open' ? null : (seen ?? kept);
  const value = useMemo(
    () => ({ campaign, conn, selected, select, last }),
    [campaign, conn, selected, last],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The player console's table when there is one: for shell chrome that serves both consoles. */
export function usePlayerTableIfAny(): PlayerTable | null {
  return useContext(Context);
}

/** The player console's table. Only for components inside a player console. */
export function usePlayerTable(): PlayerTable {
  const table = useContext(Context);
  if (!table) throw new Error('usePlayerTable outside a player console');
  return table;
}

/** The link's state as a sentence, to lead into another: no full stop after an ellipsis. */
export function linkSentence(link: Connection['link']): string {
  const text = linkText(link);
  return text.endsWith('…') ? text : `${text}.`;
}

/** When the table was last seen, as the offline view says it: a time today, else a date. */
export function lastSeenText(at: string): string {
  const when = new Date(at);
  return new Date().toDateString() === when.toDateString()
    ? `at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : `on ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** The player's creatures in row order: each character, then its companions and summons. */
export function orderMine(mine: readonly CreatureView[]): CreatureView[] {
  const out: CreatureView[] = [];
  for (const pc of mine.filter((c) => !c.companionOf)) {
    out.push(pc, ...mine.filter((c) => c.companionOf === pc.id));
  }
  for (const c of mine) if (!out.includes(c)) out.push(c);
  return out;
}

/** What the link is doing, in the player's words. */
export function linkText(link: Connection['link']): string {
  switch (link) {
    case 'open':
      return 'At the table';
    case 'connecting':
      return 'Looking for your GM’s table…';
    case 'reconnecting':
      return 'Your GM’s table isn’t up right now';
    case 'stopped':
      return 'Your GM closed the table';
    case 'otherCampaign':
      return 'Your GM is running another campaign';
    case 'refused':
      return 'That address is not on your local network';
  }
}
