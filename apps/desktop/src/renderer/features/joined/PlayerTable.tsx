import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { JoinedSummary } from '@trifold/api';
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
}

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
  const value = useMemo(() => ({ campaign, conn }), [campaign, conn]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
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
