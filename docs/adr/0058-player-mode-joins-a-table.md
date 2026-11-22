# ADR 0058 — Player mode: a Trifold that joins another Trifold's table

**Status:** accepted, 2026-11-23. Being built behind a flag; `docs/PLAYER-MODE.md` is the plan.

## Context

Trifold was a DM's console, and players reached the table through a page in their phone's browser (ADR 0043). Players who also own Trifold asked to use it at the table: the same map and numbers, in the app, beside their compendium and notes. An earlier idea of a separate companion app was dropped in favour of one install that does both.

`DESIGN.md` §1.2 said the app goes to the network only when the DM asks, in three ways. A Trifold that joins someone else's table is a fourth.

## Decision

- **One app, two roles.** A Library holds the campaigns it runs and the campaigns it joined. The Campaigns page lists them as Running and Playing. The console shell loads one console at a time, the GM's or a player's, each with its own tabs, tools and saved layout.
- **A joined campaign is a local shell, never a copy.** `joined/<campaignId>/joined.json` holds the campaign's name, the player's display name, the addresses that worked, the device token and the linked character, with the player's own notes beside it. The GM's campaign data is never written into the player's Library; the player's console is filled from the same per-device view a phone gets.
- **The player's Trifold is a device at the table.** It speaks the phone page's protocol to the GM's table server, from the main process, with the table's own address as its origin. The server needed no change for that. Claims, the reclaim mode, movement locks and every check apply as they do to a phone.
- **The claim travels with the Library.** The device token is kept in `joined.json`, so a port or address change does not lose a claim, and a Library restored from a backup is the same device.
- **Tables are found on the local network.** The table server's mDNS responder also advertises a DNS-SD service (`_trifold._tcp.local`) with the port, the campaign id and the campaign name. Join a campaign lists the tables that answer; typing the address the GM's Trifold shows is the fallback for networks that block the search.
- **A fourth network use, started by the player.** The search and the connection run only while the player has Join a campaign or a joined campaign open, and only on the private local network: a typed address must be a private address or a `.local` name, a name that resolves elsewhere is dropped, and addresses heard in the search are kept only when private. Nothing searches or connects at launch.
- **Behind a flag until it is finished.** Releases are cut from `main` and the Windows build updates itself, so everything a user could see is off unless `TRIFOLD_PLAYER_MODE=1`. With the flag off the main process starts no search and opens no connection, whatever the renderer asks.

Remote play over the internet is designed in the plan and paused. It will get its own ADR.

## Consequences

- `CLAUDE.md` ground rule 1 and `DESIGN.md` §1.2 name four network uses.
- A new file kind, `joined`, at version 1; `library.json` gains `workspace.playerConsoles`, additive.
- The table's campaign name is now broadcast on the local network while Let players join is on. It was already sent to anything that connected.
- The responder listens with multicast loopback on, so a player's Trifold on the same computer can find the table. Nothing changes on the wire.
- Anyone holding a copy of a player's Library or backup holds that player's claims. Settings › Backups will say so in one warning about sharing backups.
