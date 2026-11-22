import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CreatureView, JoinedSummary } from '@trifold/api';
import { useShellStore } from '../../stores/shellStore';
import { useConnection, type Connection } from '../../../web/connection';
import { createBridgeClient } from './bridgeClient';

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
  const conn = useConnection(client);
  const [selected, select] = useState<string | null>(null);
  // The tracker is waiting for one of the player's creatures to roll initiative: the Initiative
  // tool comes forward, as a section or a flyout, so the box to enter it is never out of sight.
  const rollWanted = conn.link === 'open' && !!conn.view?.mine.some((c) => c.needsInitiative);
  useEffect(() => {
    if (rollWanted && useShellStore.getState().role === 'player') {
      useShellStore.getState().showTool('initiative');
    }
  }, [rollWanted]);
  const value = useMemo(() => ({ campaign, conn, selected, select }), [campaign, conn, selected]);
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
