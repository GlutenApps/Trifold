import { useJoinedStore } from '../../stores/joinedStore';
import { MEDIA_SCHEME, type ClientView, type ServerMessage } from '@trifold/api';
import type { TableClient } from '../../../playerUi/connection';

/**
 * The player console's transport (docs/PLAYER-MODE.md, "Connection"): the same `TableClient` the
 * phone page uses, with main in the middle. Main owns the socket to the GM's table and the
 * claim; this side asks main to open the campaign, listens for what the table says, and hands
 * requests back. Nothing here touches the network.
 */

/**
 * A view with its pictures pointed at main. A table names its pictures by its own paths
 * (`/map/…`, `/t/…/art?v=…`); the console must never fetch them itself, so each becomes a
 * `trifold-media://table/<campaign>/…` address that main answers from its cache or the table.
 */
export function withTableUrls<V extends ClientView>(view: V, campaignId: string): V {
  const base = `${MEDIA_SCHEME}://table/${encodeURIComponent(campaignId)}`;
  // Only a table's own absolute paths are followed; anything else is dropped, not loaded.
  const at = (path: string | undefined) =>
    path && /^\/[^/]/.test(path) ? `${base}${path}` : undefined;
  const set = <T extends object, K extends string>(obj: T, key: K, path: string | undefined) => {
    const { [key]: _old, ...rest } = obj as Record<string, unknown>;
    const url = at(path);
    return (url ? { ...rest, [key]: url } : rest) as T;
  };
  return {
    ...view,
    mine: view.mine.map((c) => set(c, 'portraitUrl', c.portraitUrl)),
    picker: view.picker.map((p) => set(p, 'portraitUrl', p.portraitUrl)),
    map: view.map && {
      ...set(view.map, 'imageUrl', view.map.imageUrl),
      tokens: view.map.tokens.map((t) => set(set(t, 'artUrl', t.artUrl), 'glyphUrl', t.glyphUrl)),
    },
    ...(view.screen?.kind === 'image'
      ? { screen: { ...view.screen, imageUrl: at(view.screen.imageUrl) ?? '' } }
      : {}),
  };
}

export function createBridgeClient(campaignId: string): TableClient {
  return {
    start({ onLink, onMessage }) {
      const offs = [
        window.trifold.on('joinedLink', (event) => {
          if (event.campaignId !== campaignId) return;
          useJoinedStore.setState({ tableVersion: event.tableVersion ?? null });
          onLink(event.link);
        }),
        window.trifold.on('joinedMessage', (event) => {
          if (event.campaignId !== campaignId) return;
          const message: ServerMessage =
            event.message.type === 'state'
              ? { ...withTableUrls(event.message, campaignId), type: 'state' }
              : event.message;
          onMessage(message);
        }),
      ];
      onLink('connecting');
      void window.trifold.joined.open(campaignId);
      return () => {
        for (const off of offs) off();
        void window.trifold.joined.close(campaignId);
      };
    },
    send(message) {
      void window.trifold.joined.send(campaignId, message);
    },
  };
}
