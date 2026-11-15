# ADR 0043 · A local table server for the player connector

**Status:** accepted, 2026-11-14. Amends `DESIGN.md` §1.2 and §2, `CLAUDE.md` ground rule 1 and
the data model in `docs/PLAYER-CONNECTOR.md`. Follows ADR 0032.

## Context

The player connector (Beta 14, ADR 0032) needs Trifold to serve a page to browsers on the
table's Wi-Fi. `DESIGN.md` §1.2 rules out a web client and ground rule 1 allows only two network
uses, web tabs and the update check. ADR 0032 said both would be amended, and the packages
named, before Phase 1 is built. The Phase 1 plan in `docs/PLAYER-CONNECTOR.md` was confirmed by
the DM on 2026-11-14.

## Decision

1. **A third network use: the table server.** Started by the DM with Let players join in the
   VTT tab's Player devices pop-up, stopped by Stop, by closing the campaign or by quitting.
   Off by default and never started on launch. It listens only on the machine's private LAN
   addresses (10/8, 172.16/12, 192.168/16, IPv6 link-local and ULA), never on all interfaces,
   drops connections from any other address, checks every request's `Host`, and answers mDNS
   for `trifold.local` on the LAN while it runs. It serves the one open campaign's player view
   to browsers that connect to it and sends nothing anywhere else. No UPnP, no port forwarding,
   no relay.
2. **Packages**, all pure JS, pinned: `ws` 8.22.0 (WebSocket), `multicast-dns` 7.2.5 (mDNS
   responder), `qrcode-generator` 2.0.4 (join QR codes). HTTP is Node's own `http`.
3. **Claims and devices live in `campaigns/<slug>/players.json`**, written only by main through
   `LibraryStore`, not as a `claim` field on each PC card and NPC. The console saves those files
   whole, so two writers would erase each other's changes. Only `playerControllable` goes on the
   PC card and the NPC, set by the DM in the console.
4. **The console stays the owner of game state.** The server is a relay beside the player
   window: the console pushes a table snapshot, main filters it per device with pure functions
   in `packages/rules`, and (from Phase 2) players' intents go to the console to apply.
5. **Phones follow the TV:** the map scene live on the TV, every revealed area. Anything else
   on the TV, nothing, or a blackout shows no map.
6. **DM release ships in Phase 1**, per creature and Release all, ahead of Phase 2's reclaim.

## Consequences

- `CLAUDE.md` ground rule 1 lists three network uses; `DESIGN.md` §1.2 drops "no web client"
  for the connector's page, still with no sync between users and no backend beyond the DM's
  machine.
- The fog functions move to `packages/rules` so main, the TV and the console share one "is this
  point under fog" test.
- `players.json` is campaign data: it is backed up with the Library. A campaign export leaves it
  out, like From another campaign… leaves claims behind: devices belong to one campaign.
- The working port is app config, not campaign data, because it is part of the browser origin
  players' device tokens are stored under.
