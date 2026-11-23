# Player mode: implementation handoff

Drafted 2026-11-21, revised against the code 2026-11-22 (v0.4.6, commit `0c7edc6`). Status: proposed, nothing built.

## Overview

Trifold gains a player mode inside the same app: one install, one name, used to run campaigns and to play in them. There is no separate companion app.

- **Players join a GM's table from their own Trifold.** The campaign then shows up in the player's Library, and the campaign list splits into **Running** (campaigns you GM) and **Playing** (campaigns you joined).
- **Opening a Playing campaign opens a player console.** It has the same shape as the GM console (stage, dock, strip), with panels centred on the player's own creature.
- **The first build is for the local network.** The player's Trifold connects to the GM's table server, the same one phones use (ADR 0043). Remote play over the internet is designed in Part 4 and paused until the player side is built and working.
- **The browser connector stays as it is** for players who don't install anything.
- **Characters can live anywhere.** A player can keep their sheet in another tool (in a web tab), import its numbers from an exported PDF sheet, or build the character in Trifold.

The GM's machine stays the single authority for everything at the table, and nothing changes for a GM who never has a player use the app.

This document is self-contained. An earlier remote play handoff and a "Trifold Companion" app were discussed outside the repo; neither is in it, and nothing here depends on them.

Where this doc and the code disagree, the code wins: flag the difference rather than forcing the doc's version.

The document has four parts: **Part 1**, player mode on the local network; **Part 2**, shared content, player packs and table rolls; **Part 3**, characters; **Part 4**, remote play, paused.

## Read first

- `CLAUDE.md`, especially ground rule 1 (network uses), rule 2 (files-first, `LibraryStore` only) and rule 7 (scope).
- `docs/DESIGN.md` §1 and §1.2 (what the app is, non-goals), §4.1, §4.2 and §4.4 (architecture, Library layout, boundaries), §5.2 (PC card), §6.5 (Presenter, which holds the player connector), §8 (content policy), §9 (UX notes), §10 Later.
- `docs/PLAYER-CONNECTOR.md`, all of it. Server and addresses, Transport, Server-side filtering, Who owns what and Stored data matter most.
- ADR 0004 (stage, dock, strip), 0011 (web tabs), 0017 (search), 0029 (holds the PDF sheet import in Later), 0036 (per-campaign sources), 0043 (local table server), 0046 (go live: phones show only what the TV shows).
- Code: `apps/desktop/src/main/table/` (`hub.ts`, `listen.ts`, `mdns.ts`, `players.ts`), `apps/desktop/src/web/` (all of it), `apps/desktop/src/renderer/features/players/` (`snapshot.ts`, `applyIntent.ts`, `PlayerDevices.tsx`), `features/shell/` (`AppShell.tsx`, `Stage.tsx`, `Dock.tsx`, `LiveStrip.tsx`, `majors.tsx`, `minors.tsx`), `packages/rules/src/table/` (`types.ts`, `view.ts`, `network.ts`), `packages/schema/src/library.ts`, `campaign.ts`, `packages/schema/migrations/index.ts`, `apps/desktop/src/main/media.ts`.

## What the code says that shapes this plan

Facts from the repo that the first draft did not have.

1. **The shell is wired to the GM's stores.** `AppShell` shows the console when `useCampaignStore.current` is set, and `LiveStrip`, `Dock`, `Stage` and `TopBar` read the campaign, combat, presenter and music stores directly. Picking a different panel set is not enough to make a player console.
2. **The phone client's pieces are phone-shaped.** `web/Playing.tsx` is the phone page's composition and chooses its layout from the window size (`useLayout.ts`), not a panel's. `tools.tsx` (`HealthTool`, `ConditionsTool`, `CompanionsTool`, `MoveTool`) and `MapView` take plain props and can be reused, but they are styled by `web.css` with 44 px touch targets, which is not the console's control scale (`UI-GUIDELINES.md`).
3. **`InitiativeCard` is the "enter your initiative" box**, a private function in `Playing.tsx`. The order comes from `overlays.initiative` in the view, which is sent only while the DM's Initiative strip overlay is on, and its entries carry no link to the device's creatures (`snapshot.ts` strips `tokenId`). Nothing in a view says whose turn it is for a given device.
4. **The table server refuses anything that is not its own page.** A WebSocket upgrade must come from a private address, name one of Trifold's own addresses in `Host`, carry a matching `Origin` and ask for `/ws` (`hub.ts`, `upgrade`). The console renderer's origin would be refused, so the app's connection has to be made from main.
5. **A device is a token.** The server sends `campaign`, the client answers `hello` with its token, and a first claim returns `token` once. A phone keeps it in `localStorage` under the page's origin, which is why a port change makes phones pick again.
6. **The table is not advertised as a service.** `mdns.ts` answers A and AAAA for `trifold.local` and nothing else, so the network can give a name's address but not the port or the campaign.
7. **`QuickNotesTool`, `PinnedRolls` and `CompendiumPage` read `useCampaignStore`.** Quick notes file into the GM's notes tree, pinned rolls are per campaign, and the compendium applies per-campaign sources (ADR 0036) and offers campaign actions.
8. **Schema versions are per file kind in the migrator but shared in the schemas.** `CURRENT_SCHEMA_VERSION` has `pc`, `players` and `campaign` separately, all at 1, while `PCCard`, `PlayersFile` and the rest share one `CAMPAIGN_SCHEMA_VERSION` literal. Additive fields with defaults take no bump in this repo (see `sourcePriority` in `library.ts`).
9. **`dndBeyondUrl` exists only in the `PCCard` schema and DESIGN §5.2.** No form, importer or exporter reads or writes it.
10. **`trifold-media://` is the one custom scheme**, registered in a single `registerSchemesAsPrivileged` call before `app.whenReady()` and routed by host (`icons`, `track`, `library`).
11. **Campaign search ranks in memory.** Only the compendium half of global search asks SQLite (ADR 0017).
12. **Releases are cut from `main`, and the installed Windows build updates itself** (ADR 0045).

## Decisions

Four ADRs, numbered in the order they land, each with a row in the index and the decision log. ADR 0057 is already taken by Your turn and you're next, which landed first. Remote play gets its own when it is built.

**Shared content and player packs.** A GM can share content with a campaign's players, by source for imported sources (player-facing kinds only) and by record for homebrew, over the table connection and as a pack file before the first session. Shared content lives in the joined campaign and nowhere else. This rewrites `DESIGN.md` §8 item 3 ("the app sends content nowhere") and the decision log's "Nothing is hosted or shared"; sharing carries the same non-SRD warning as export.

**Table rolls.** A player's roll is Table (made on the GM's machine, shown in the GM's and the players' roll logs) or Private (never leaves the player's machine).

**Player mode in Trifold.** The player side ships inside Trifold. A Library can hold campaigns it runs and campaigns it joined. A joined campaign opens a player console built from the per-device view, never from GM campaign data. The player's Trifold is a client of the GM's table server on the local network, with the same messages, views and checks as a phone. The browser connector stays.

**Player-facing characters.** Players can have a character sheet in Trifold, import one from a PDF they exported elsewhere, or keep it elsewhere entirely. A character builder is in scope. The player owns the sheet; the GM's console owns table state. This amends ADR 0029, which left the PDF import in Later.

These revise `DESIGN.md` §1.2:

| Non-goal today | Becomes |
| --- | --- |
| No character builder or player-facing character sheets. | Players may build, import or link their characters; the GM's console stays the authority for table state. |
| No accounts, no cloud backend, no sync between users, no hosted web client. The connector is LAN-only (ADR 0043). | Unchanged, with one addition: a player's Trifold can join another Trifold's table on the private local network. |

`CLAUDE.md` ground rule 1 gains a fourth network use: **joining a table**, started by the player opening Join a campaign or a joined campaign: a search of the local network by mDNS and a connection to a private LAN address, running only while that panel or campaign is open. Nothing searches or connects at launch or from the Library's other pages. `DESIGN.md` §8 item 3 changes to match.

### Scope and release safety

Ground rule 7 applies: none of this is in M1. Phases land on `main` one PR at a time and releases are cut from `main`, so everything a user could see (Join a campaign, the Playing list, the Sheets tab) stays behind one flag, off in packaged builds, until phase 2's acceptance passes. The repo has no flag mechanism yet; add a minimal one in phase 1 (a constant in `packages/api` read by main and renderer, with an environment override for dev and smoke runs).

---

# Part 1: Player mode on the local network

## Joined campaigns

A joined campaign is a local shell that points at the GM's machine, never a copy of the GM's campaign. It holds what the player owns (their notes, their link to a character, their device token) plus caches the GM sent.

### The campaign list

`features/library/CampaignsPage.tsx` splits into **Running** and **Playing**. Running is today's list, unchanged. Playing lists joined campaigns with the last time each was live. A Library with no joined campaigns shows no Playing section; **Join a campaign** sits beside Create campaign.

The list does not connect to anything. Whether a GM's table is up is only found out when the player opens a joined campaign.

Every Library still gets the sample campaign once (ADR 0016), so a player-only Library shows it under Running.

### Joining

Built, behind the flag (ADR 0058): Join a campaign with the search and the typed address, the name step, the Playing list and Leave. Run end to end by `smoke/joined.spec.ts` with two copies of the app on one computer. Opening a joined campaign is next.

Nothing changes in what the GM does: Let players join in the Player devices pop-up starts the table server and shows the addresses, the QR and Copy link, as today.

1. The player chooses **Join a campaign**. Trifold searches the local network and lists the tables it finds, each with its campaign name and a **Join** button. With one GM in the room that is one row.
2. The player presses Join, types a display name (pre-filled from the last one used; it is the device label the GM sees) and confirms. The campaign is added to Playing and opens.
3. The player picks a character in the claim picker, under the campaign's reclaim mode, exactly as on a phone.

Under the list sits **Enter an address instead**, for networks that block the search (guest and school Wi-Fi often do, the same ones that trouble `trifold.local` on phones): the player types or pastes the address the GM shows. Trifold accepts only a `.local` name or a private address (`isPrivateAddress` in `packages/rules`). If the search finds nothing after a few seconds, the panel says so and points at that field.

A player's Trifold shows in the GM's device list like any other device.

### Table discovery

Built, both sides, without its UI: the advertisement in `main/table/mdns.ts` and the search in `main/joined/discovery.ts` (PLAYER-CONNECTOR.md, The table as a service). Checked on real sockets with both on one computer.

The table server answers mDNS for its name only today (`mdns.ts`: A and AAAA for `trifold.local`), which gives an address but no port and no campaign. Add a DNS-SD service to the same responder, on the socket it already holds:

- a PTR record for `_trifold._tcp.local`, an SRV record with the server's port and local name, and a TXT record with the campaign id, the campaign name and a protocol version;
- announced on start and when the addresses change, withdrawn with a goodbye on stop, like the name;
- answered for legacy unicast queries too, as the name is.

The campaign name is already sent to anything that connects to the server (the `campaign` message), so the TXT record tells the local network nothing new.

The player side, `main/joined/discovery.ts`, sends the PTR query a few times and collects answers. It runs only while the Join a campaign panel is open or a joined campaign is open and not connected, and it is multicast on the local network, nothing else. The record building and parsing are pure functions with tests beside `answerFor`.

### Finding the table again

Opening a joined campaign looks for a table advertising its campaign id, and connects to it wherever it is now: a new address or port needs nothing from the player. If the search is blocked, it falls back to the addresses that last worked, kept in `joined.json`. If a table is found with a different campaign from the same computer, the player sees "Your GM is running another campaign". If nothing answers, see the offline view; **Change address** lets the player type one.

### Claims follow the Library

A claim is the device token, and the token is kept in `joined.json`, by campaign, inside the Library. So:

- a port or address change does not cost the player their claim, as it does a phone;
- backups already carry it, since they zip the whole Library: a player who restores a backup on a new computer opens the joined campaign and is back on their characters, with no picking and nothing for the GM to do;
- a Library opened on two computers is one device to the GM. The hub already allows several connections from one device.

Anyone holding a copy of the player's backup could take that player's characters at the table. Settings › Backups says so in one warning about sharing backups, styled as a warning and not a hint, shown beside the second backup location too (ADR 0015). It is a single warning that lists what a copy of a backup, or of a synced Library folder, lets someone else do:

- play your characters in the campaigns you joined (from phase 2, shown once the Library has a joined campaign);
- pose as you to your players (added with remote play, Part 4, once the Library has a key).

Each line shows only when it applies, and the warning is absent when neither does. Part 4 adds its line to this warning; it does not add a second one.

Built: the warning sits under Second copy in Settings › Backups, the row where a backup is sent somewhere else, with its lines from `sharingEffects` in `BackupsSection.tsx`.

### Opening a joined campaign

Built, behind the flag: Open on a Playing card loads the player console in the shell's player role, main keeps the connection (trying where the search finds the table, then the addresses that worked), and the VTT tab shows the picker, then the map or the TV's screen with its overlays, moving one's own tokens, and the box to enter initiative. The strip shows the link, the round and Your turn or You're next. The table's pictures come through `trifold-media://table/…` from main's cache in the app's user-data folder. `smoke/joined.spec.ts` runs it with two copies of the app. Quick notes and Dice are in too (below). The offline view is in: main keeps what the table last showed this player in `table-cache/<joined id>/last-view.json`, beside its pictures and outside the Library, and while the table is not up the VTT tab shows that map and My characters lists those characters, both to look at only, with when they were last seen. The console goes live by itself when the table is found. Global search is in: the top bar's field searches the player's own notes by title and by text, the web tabs and the compendium, and a found note opens in Quick notes (`homeOf` in `navigate.ts` takes the console's role). Change address is in: while the player is not at the table the VTT tab offers it, main asks the typed address which campaign it is, and only this campaign's table is kept in `joined.json` and connected to. That completes the console's list for Part 1.

Opening a Playing campaign shows the player console at once and connects in the background.

- **Live:** the console fills from the server's view and works as described under Player console.
- **Not live:** an offline view shows the character sheet, the player's notes and the last map image from the cache. A quiet status shows Waiting for your GM, retrying with backoff, and the console goes live by itself when the table comes up. Retries stop when the campaign is closed.

### Leaving

**Leave campaign** deletes the local shell (with the usual inline confirm) after releasing what the device holds, if the table is reachable. The GM releases a character or a device as today.

## Player console

The player console has the GM console's shape and is filled from the per-device `ClientView`, never from a GM campaign with panels hidden. Trifold is open source, so anything that reaches a player's machine can be read; the server's per-device filtering is the only protection.

### Its own composition

Build `features/joined/PlayerConsole.tsx` as a sibling of the GM console inside `AppShell`, with its own Zustand store (`joinedStore`) holding the open joined campaign, the link state and the latest view. While a joined campaign is open, `useCampaignStore.current` stays null and the combat, presenter, scene, counters and timers stores stay empty. That is what makes the acceptance check "the player console never loads GM campaign data" true by construction.

- `Stage`, `Dock` and the rest of the chrome are the GM's own components. The shell store loads one console at a time in one of two roles, `gm` or `player` (`shellStore.ts`, `shellLayout.ts`): the role decides which tabs and tools a layout may hold and where it is saved. `majors.tsx` and `minors.tsx` stay the registries and carry both consoles' kinds; Compendium and Quick notes are the same kind in both. Built.
- The strip is a new, fixed `PlayerStrip` (connection status, round, "Your turn" or "You're next", Dice). `LiveStrip` and the tray's choosable sections (ADR 0023) are the GM's and are not reused.
- `TopBar` shows the campaign name and the way back to the Library; global search covers the player's notes, characters and the compendium.

### Panels

| Where | Panel | Built from |
| --- | --- | --- |
| Stage | **VTT**: the map, or the TV's title, image or break screen, with its overlays | `web/MapView.tsx`, `ScreenView.tsx`, `TvOverlays.tsx` |
| Stage | **Sheets**: the full page of whichever of the player's creatures is selected: the PC's sheet, a companion's or summon's stat block, a pinned form | New (below, and Part 3) |
| Stage | **Compendium**: bundled SRD and the player's own sources and homebrew | `features/compendium`, with the campaign actions off |
| Stage | **Web tabs**, such as a sheet kept in another tool | Existing web tabs (ADR 0011), Library-wide as today |
| Dock | **My characters**: a row for the player's PC and each companion and summon, with HP and conditions changed in the row; move, and add a companion | New, on the pattern of the GM's party rows (ADR 0055) |
| Dock | **Initiative**: the order as the TV shows it, the player's turn marked, and the box to enter a roll | `InitiativeStrip` entries; `InitiativeCard` moved out of `Playing.tsx` |
| Dock | **Quick notes**: private notes, saved in the joined campaign | The note editor, behind a notes source (below) |
| Pop-up | **Dice**: rolls stay local | `features/dice` |
| Strip | Connection status, round, "Your turn" or "You're next" | New `PlayerStrip` |

When the player holds no creature, the VTT tab shows the claim picker (`web/Picker.tsx`) in place of the map. Not in the player console: Campaign (party, NPCs, GM notes), Encounters, VTT controls, Scenes, Music, and editing counters or timers (their overlays still show on the VTT tab).

Reuse notes, from the code:

- **Shared so far.** The phone page's document-level styles are in `web/page.css`, so the console loads `web.css` for the components; moving a token is `web/useMovePlan.ts`, used by both. The files have not moved folders yet.
- **Shared components move.** Put what both clients use (`MapView`, `ScreenView`, `TvOverlays`, the four tools, `AddCompanion`, `Picker`, `Portrait`, `InitiativeCard`) in a folder both import, and leave `Playing.tsx`, `App.tsx` and `useLayout.ts` as the phone page's own. The tools need the console's control scale in a panel (30 px, `UI-GUIDELINES.md`) and keep the 44 px touch scale on phones: one set of components, two style sheets.
- **`Picker`** reads the device label from `localStorage` (`connection.ts`); in the player console the name comes from `joined.json`.
- **Quick notes.** `QuickNotesTool` files into the GM's notes tree through `useCampaignStore`. Give it a notes source (save, list, the Quick Notes folder) that the GM console backs with the campaign store and the player console with `joined/<id>/notes/`. Built: `features/campaign/notesSource.ts` is the seam. A player's notes are a flat list, every one a quick note, so Move to and Open in Notes are not offered there; `Ctrl+N` and `Ctrl+S` work as in the GM's console. They are files in the player's Library and are never sent to the table.
- **Dice.** The roller is reused; pinned rolls are per campaign today, so in the player console they save to `joined/<id>/pinnedRolls/`. Built: the player's strip ends with the compact pool and the Dice button, `Ctrl+D` opens the pop-up, and `pinnedRollsStore` writes to whichever campaign is open, run or joined. Rolls stay on the player's computer until table rolls (Part 2).
- **Compendium.** `CompendiumPage` applies the open campaign's sources. In the player console it shows what the Library shows for "All campaigns" and hides Edit in campaign, Used by and Replace.

### My characters and Sheets

Built so far, behind the flag: My characters with its rows (HP and conditions through the GM's own `HpChip`, `HpEditor` and `HeldConditions`, sent as intents), selection shared with the VTT tab, removing a companion, Add a companion and Switch character with its Undo; and the Initiative tool (the box to enter a roll, which brings the tool forward and puts an alert pip on it, the order while the TV shows it, and Your turn or You're next either way). Since built (ADR 0069): Open sheet on each row (and a double-click), the pencil on the PC's row, and Link a character, New character and Unlink under the rows, offline too. The console-scale pass is done: inside a console panel the picker, Add a companion and the initiative box take the console's sizes from the `.pc-host` rules at the end of `web/web.css`.

The two work as Scenes and the VTT tab do in the GM's console (ADR 0008): the dock tool is the quick view that acts at a high level, and the stage tab shows the selected one in full (Ian, 2026-11-23).

**My characters** (dock) lists what the player has at this table: their PC first, then each companion and summon.

- Each row has a status line built like the GM's party rows (ADR 0055): HP is a button that opens the inline Damage / Heal / Temp HP editor, and conditions add from a plus. These are the same intents a phone sends. The phone page keeps its own tools.
- A click selects a row. The Sheets tab shows the selection if it is open, and does not come forward by itself, so changing HP mid-fight never puts a sheet over the map. **Open sheet** on the row, a double-click or Enter brings Sheets forward.
- The PC's row has a pencil that opens its sheet in Sheets, editing. Companions and summons have none: their stat blocks are the GM's.
- **Add a companion** and the move controls live here.
- With no character linked: **Link a character** (one from the Library) and **New character** (which starts one in the Library and opens it in Sheets).
- While the table is not up, the linked PC is still listed, without the live controls.

**Sheets** (stage) shows the selected creature in full, with a switcher along its top that mirrors the dock's rows:

- **The PC:** the sheet (Part 3). **Edit** is on the sheet itself; the dock's pencil is a shortcut to it.
- **A companion or summon:** its stat block, read-only, with its live HP and conditions above. A stat block shows only when the player's Trifold has the creature: bundled SRD creatures always, the GM's own through shared content (Part 2). Until then it shows the name, type, AC and HP the table sends.
- **Forms:** stat blocks the player pins from their compendium, for a wild shape or any other transformation, and flips to when they change. Reference only at first: the token and HP are untouched, which fits the 2024 rules, where the druid keeps their own hit points and gains temp HP. A separate HP pool for 2014 forms is left for later.

The HP and conditions shown on a sheet are the same live controls as the row's, reading the table's numbers while connected, never a second copy.

Order of building: My characters with its rows, and Sheets for the PC, first; companion stat blocks when shared content lands; forms after.

### Your turn and you're next

Built for the view and the phone page (ADR 0057, PLAYER-CONNECTOR.md, Your turn); the player console's strip and Initiative panel read the same field in phase 2.

Each `CreatureView` gains `turn?: 'now' | 'next'`, set in `viewFor` for the device's own creatures:

- `now` while the creature's combatant is the active one in the loaded fight;
- `next` while it is the one the tracker's Next turn would move to.

A player is told about their own turn whether or not the DM has the Initiative strip overlay on; the order itself still shows only with the overlay, as on the TV (ADR 0046). "You're next" says nothing about who is acting now, so it gives away no hidden combatant.

To build it, the console's snapshot marks each claimable creature's turn state (`TableCreature.turn`), computed from the combat store by the same rule Next turn uses, so hordes, dead combatants and skipped turns agree with the tracker. `viewFor` copies it only onto creatures the device holds, summons included. This is a change to `packages/rules/src/table` and `features/players/snapshot.ts`, with tests, and phones get it too: the phone page shows the same two notes in its character summary.

The strip shows "Your turn" or "You're next" with the creature's name when the player holds more than one; the Initiative panel marks the row when the order is showing.

### Layouts

`MAJOR_KINDS` and `MINOR_KINDS` are schema enums stored in saved layouts. Add `PLAYER_MAJOR_KINDS` (`table`, `sheets`, `compendium`; the `table` tab is titled VTT, like the GM's) and `PLAYER_MINOR_KINDS` (`myCharacters`, `initiative`, `quickNotes`), a `PlayerShellLayout` built from them, and `workspace.playerConsoles` keyed by joined campaign id, so neither role's layout can name the other's panels. All additive with defaults: no `library.json` version bump. `majors.tsx` and `minors.tsx` stay the registries and gain the player entries. Named layouts (Prep, Table, Combat) stay the GM's; the player console keeps one layout per joined campaign.

Player hotkeys register in `hotkeys.ts` like the rest, active only while a joined campaign is open. The GM's table hotkeys (blackout, next turn, go live and the others registered in `AppShell`) must do nothing there.

### The map

Use `MapView` inside the VTT panel. It already renders `ClientMap` with the fogged image, borrows the console's `TokenDisc` and ruler, and handles drags through the movement messages. Check it from the 480 px panel floor up: it was built for a phone page, and anything that reads the window's size has to read the panel's. The GM's `MapLayer` is not touched.

### Actions

Every edit is the same `ClientMessage` the phone sends: `intent`, `claim`, the movement messages, `summon` and the rest. The server's checks (`intentProblem`, drag locks, summon limits) apply unchanged. The console shows the server's state, not a local guess, apart from the drag preview the phone already does.

## Connection

The player's Trifold speaks the phone's protocol to the GM's table server. The only server change is the service advertisement under Table discovery.

### TableClient

Built in main, without the bridge or any UI: `main/joined/store.ts` (the joined-campaign files) and `main/joined/lanClient.ts` (the connection, and reading a typed address). `LanClient` also refuses a table that is up with another campaign without sending it anything, and a `.local` name that resolved to an address outside the local network.

`web/connection.ts` is a React hook around one WebSocket with tokens in `localStorage`. Split it into a `TableClient` interface with two implementations, and have `useConnection` take a client:

- **WebSocketClient:** today's behaviour for phones, unchanged.
- **BridgeClient:** for the player console. The renderer talks to main through the preload bridge (`packages/api`); main's `LanClient` (`src/main/joined/`) owns the socket.

`LanClient` opens `ws://<address>/ws` with the `ws` package already in the app, sending the table's own address as `Origin`, so it passes the server's checks as its page would (fact 4). It answers `campaign` with the token from `joined.json`, saves a new `token` there through `LibraryStore`, reconnects with backoff, and takes a fresh view on every reconnect. It refuses any address that is not private.

When remote play is built, a second client sits behind the same `BridgeClient`; the renderer does not change.

### Pictures

Picture URLs in a view are table-server paths with a version query (`tablePaths` in `view.ts`, for example `/t/<tokenId>/art?v=<hash>`). The renderer never loads them from the network. It asks `trifold-media://table/<joined id>/<path and query>`, a new host on the existing scheme (no second privileged scheme, no CSP change); main fetches the path from the table server over HTTP, keeps it in the image cache, and serves it. A changed picture gets a new path, so the cache never needs invalidating, only trimming, and the last map image is there for the offline view.

### What the player sees when it fails

- **Nothing answers:** "Your GM's table isn't up right now." The joined campaign keeps looking while open, and offers Change address in case the network blocks the search.
- **Another campaign is up:** "Your GM is running another campaign."
- **Reconnecting** and **Table closed** show in the strip, never as a modal.

## Data model for Part 1

Every stored object has a Zod schema in `packages/schema`. A change that old files cannot parse gets a version bump and a forward migration in `packages/schema/migrations`; an added field with a default does not. All Library files are written through `LibraryStore` (`writeJson`, `writeBytes`).

New folder in the Library (`DESIGN.md` §4.2):

```
Trifold Library/
  joined/
    <campaignId>/
      joined.json               campaign id and name, addresses that last worked (the fallback
                                when the search is blocked), device token, display name,
                                linked character id,
                                joined and last-live dates
      notes/<id>.json           the player's quick notes
      pinnedRolls/<id>.json     rolls the player pinned
```

One new file kind in the migrator, `joined`, at version 1. `library.json` gains `workspace.playerConsoles`, additive. `config.json` gains the last display name, additive.

The device token in `joined.json` is the player's own secret, the same one a phone keeps in its browser. It is never logged.

The image cache is derived data, like the index, and can always be fetched again, so it lives in the app's user-data folder (`table-cache/<joined id>/`), not in the Library: Libraries often sit in a synced folder, and a cache of map images should not be uploaded by a sync app or zipped into backups. It is trimmed by age and size.

Search follows what campaigns do today: joined-campaign notes rank in memory with the campaign half of global search (ADR 0017). No new SQLite tables.

Daily backups pick up `joined/` with no change, since backups zip everything but `backups/`, `logs/` and the index. Campaign export (`.trifold-campaign`) is for running campaigns only; joined campaigns don't export.

---

# Part 2: Shared content, player packs and table rolls

## Shared content

A GM can give a campaign's players the content they need to build and play characters, and nothing that would spoil the game.

Built (ADR 0060): the GM's choices in **Campaign › Shared sources** and on a homebrew record's page; the content read by `main/table/sharedContent.ts`; `shared {hash}` and `GET /shared` on the table server; the player's copy in `joined/<campaignId>/shared/` as a source of kind `shared`, shown only while that campaign is open, with "Shared by your GM" and no Edit. Sync sends the whole set when the hash differs, in place of the per-record difference described below. Collections can be shared too (ADR 0062): a shared collection shares its books' player-facing records. Player packs are built too (ADR 0064): Export for players on the Shared sources tab, and Join a campaign › Open a player pack. A player's own copy of a book now stands in for the shared one, and sharing a homebrew record made from user content asks first (ADR 0060, "Built since"). Shared content is complete apart from what Part 3 needs.

### What the GM shares

In the campaign, a **Shared sources** list, off for everything until the GM turns it on:

- **Imported sources, by source.** Each source the campaign uses (ADR 0036) has a Share with players switch. Only player-facing kinds pass: spells, items, feats, species, backgrounds, classes, conditions and rules. Creatures never pass by source.
- **Homebrew, by record.** A homebrew item can be as much a spoiler as a monster, so each homebrew record is shared on its own. Sharing one during a session is how a GM hands a player an item.
- **Creatures, only these:** the stat blocks of creatures on the campaign's companion list (`settings.summonable`) and of NPCs a player holds. Nothing is derived from encounters, so a creature the GM has waiting never crosses.
- **Bundled SRD content is never sent.** Every install has it.

Sharing a record whose source is flagged non-SRD shows the same warning export shows. The app and its docs describe the feature as sharing homebrew and campaign content; they never present it as a way to pass books around (`DESIGN.md` §8).

### Where it lives for the player

Shared content arrives as one read-only source bound to the joined campaign: `joined/<campaignId>/shared/` (`source.json`, `records.jsonl`), indexed like any source and shown only in that campaign's compendium and to characters linked to it. Each record keeps its non-SRD flag and the name of the source it came from.

- No Edit, no Duplicate, and left out of every export.
- Unsharing removes a record at the next sync. It cannot un-show what a player already read.
- Leave campaign deletes it with the rest of the shell.

A player who owns a source imports their own copy; records are matched by source name and key, and their own copy is used in place of the shared one.

### Sync

On connect, the player's Trifold sends the hashes it holds; the server answers with what to add, change and remove. Over the LAN this is a route on the table server that takes the device token, so only a device the table knows gets content. Sharing or unsharing while players are connected pushes the change.

### Player packs

Before the first session the GM and players are usually not on the same network, so content cannot wait for the first connection.

**Export for players** on the campaign writes one file, `.trifold-players`, built with the campaign package code (`packages/importers/src/campaign/`, `main/campaign/packages`): the campaign's id and name, its edition settings, the shared content, and the names of the sources the campaign uses.

- **Always in a pack:** the GM's shared homebrew and the shared creatures.
- **Imported sources:** only those the GM ticks at export, with the non-SRD warning. Unticked ones are listed by name so a player who owns one knows to import it.
- The GM sends the file however they like. Trifold sends it nowhere.

A player opens the file (or **Join a campaign › From a file**): the campaign appears under Playing with its compendium loaded, with no connection. At the first session, discovery matches the campaign id, so Join connects the same shell and sync brings it up to date. Opening a newer pack does the same offline.

A pack is a file that can be forwarded and never expires. Binding its content to a campaign inside Trifold is a product boundary, not protection, which is why imported sources are opt-in per export.

### A character that leaves the campaign

A character built with shared content keeps working when it is unlinked or the campaign is left, like a paper sheet after the book is handed back (ground rule 6: nothing of the player's is deleted).

- The sheet keeps the name of every option chosen and all its numbers.
- A feature, spell or option from shared content shows its name and "from *campaign name*, no longer available" in place of its text.
- The builder and Level up will not advance through an option they no longer have, and say which source is missing.
- Rejoining, or importing the player's own copy of the source, resolves the links again by name.

So a sheet stores, for each linked record, its key, source name and display name, never the record's text.

## Party notes: left out

Notes the whole party shares were considered and left out (Ian, 2026-11-23): players can use a shared document in a web tab for that. A player's notes are their own, local to the joined campaign, and nothing about notes crosses the table connection.

## Table rolls

The player's Dice pop-up has a two-way switch, **Table** (the default) or **Private**.

- **Table:** the player's Trifold sends the expression (`1d20+5`, with its label), the GM's Trifold rolls it and sends the result to the GM's roll log and to every player's, named for the character. The app is open source, so a roll made on the player's machine and claimed as public could be faked; rolling on the GM's machine is what makes Table mean something.
- **Private:** rolled locally and never sent.
- With no connection, every roll is private and the switch says so.
- Table rolls go to the roll logs only: not the session log (ADR 0040), which is a recap, and not the TV.

New messages `roll {expression, label?}` from the player and `rolled {…}` from the server, checked like intents (the device holds a creature; the expression parses with `packages/rules` dice and is within limits). The view carries no roll history; a client that connects late sees rolls from then on.

Built (ADR 0059): the switch at the top of a player's Dice pop-up, a Table or Private badge beside the strip's pool, `roll {expression}` and `rolled {roll}`, the roll made in the GM's table server by `rollForTable` (`packages/rules/src/table/rolls.ts`), and both roll logs showing it with the source `table` and the character's name. The label is the expression; a player's own label is left for later. Rolls from a stat block in the player's compendium stay private.

Later, not in this plan: a dedicated place in both consoles to show table rolls; a GM-only setting; rolls from the phone page.

---

# Part 3: Characters

The player owns the character sheet; the GM's console owns table state. Three ways in share one sheet model, and the builder is a parallel track, not a later one.

## Where characters live and are edited

Characters belong to the Library, not to a campaign: one character can be linked from several joined campaigns. The Library gets a **Characters** page, where a character is made, opened, exported and deleted. Built (ADR 0068): the page, behind the flag, with **New character** offering an **External character** (Way 1: the table numbers and a sheet link) or a **Trifold character** (Way 3's sheet, filled in by hand until the builder lands), the one-way switch from External to Trifold, export and import as a JSON file, and a typed DELETE. Since built (ADR 0069): the Sheets tab and linking in a joined campaign. Still to come in phase 5: the `sheetUrl` migration and sheet updates. Inside a joined campaign a character can be started or edited too (My characters, Sheets); it is the same file either way.

A player can edit a character at any time, connected or not. Edits are saved to the character's file at once. When a linked character's table numbers have changed since the GM last took them, the next connection to that GM's table sends the offer (see Sheet updates), so a level-up done at home reaches the table when the player next sits down.

## Who owns what

| Data | Owner | Lives in |
| --- | --- | --- |
| Sheet: species, classes and levels, abilities, proficiencies, features, spells, equipment, notes | Player | Player's Library, `characters/<id>.json` |
| Table numbers: name, class text, level, max HP, AC, initiative bonus, speed, passives, saves, spell save DC, portrait | Player proposes, GM accepts | GM's PC card |
| Table state: current and temp HP, conditions, position, initiative | GM's console | GM's campaign, as today |

The GM's console stays the only writer of PC files (PLAYER-CONNECTOR.md, Stored data: one writer per file). A player never writes the GM's PC card directly. Table numbers map one to one onto `PCCard` fields. Players can already change max HP and AC by intent; a sheet offer is for the rest and for changing several at once.

## Sheet updates

1. A joined campaign links one of the player's characters to the PC they claimed.
2. When the linked sheet's table numbers change (a level-up, a new item), the player's Trifold sends a new client message, `sheetOffer`, with the new numbers: at once when connected, otherwise at the next connection. `joined.json` keeps the numbers the GM last accepted or dismissed, so the same offer is not sent twice. It follows the existing message naming (one camel-case word, like `keepSummon`), gets a Zod schema in the hub, and fits the 16 KiB cap. The hub checks it like an intent: the device holds that PC, and every number is in the range the PC card allows.
3. The GM sees what changed (level 4 → 5, max HP 31 → 38) in the Player devices pop-up, with the same dot other requests put on the Player devices button, the VTT tab and the strip's VTT section, and chooses Accept or Dismiss. Accept goes to the console as an event and the console applies it to the PC card through its store, like any intent. The player gets `sheetAnswer {accepted}`.
4. A per-campaign setting, **Accept sheet updates automatically**, skips the prompt. Default off. It lives in `players.json` beside the reclaim mode and the summoning mode, since main enforces it and the Player devices pop-up already reads those from the hub's status. Additive, no bump.

A GM can also create a PC card from a player's offered sheet: **New PC from player sheet** on a request from a player who holds nothing yet. A portrait travels as a picture upload and is left for later (PLAYER-CONNECTOR.md, Not built yet).

## Way 1: keep the sheet elsewhere

The player fills a short **Table numbers** form (the PC card fields) and adds a **Character sheet link**, which opens as a web tab. Nothing else is needed. The UI never names a site (ground rule 1).

On the GM side, rename the PC card's `dndBeyondUrl` to `sheetUrl`. Nothing reads the field today, so this is the schema, a `pc` migration from 1 to 2 (with the PC card's own version constant instead of `CAMPAIGN_SCHEMA_VERSION`), DESIGN §5.2 and then a new field on the PC form. Campaign packages (`.trifold-campaign`) carry PC files: check that package import runs the migrator. The schema-bump checklist applies: the tests that hard-code version numbers change, and the migration test's fixture table keeps its own.

## Way 2: import an exported PDF sheet

- **Import PDF sheet** reads the PDF's form fields locally with a pure JavaScript library (no native deps; pin the version and check its licence against GPL-3.0-or-later for the third-party notices). Main reads the file; the parsing and the field mapping are pure functions in `packages/importers/src/pdfSheet/`, returning `{ sheet, warnings }` like the other importers.
- Map by known field names per export layout, with a manual fallback where the player matches unmapped fields. Verify against real exports before committing to mappings (ADR 0029 asks for this); ask Ian for real files and keep them out of the repo (`fixtures/local/`).
- Encrypted or flattened PDFs (no form fields) get a plain message and nothing is imported. Never strip protection.
- The player confirms a preview. Re-importing updates the sheet and triggers a `sheetOffer`.
- Fixtures follow the content rule: build test PDFs with SRD-only content, generated by a script.

## Way 3: the Trifold sheet and builder

**The sheet** is a full player-facing sheet on the Sheets tab. Every derived number (AC, saves, skills, attack bonuses, spell save DC) is computed, with an optional manual override shown as overridden. Features and spells link to compendium records; custom entries are allowed.

**The builder** is a guided flow that writes a sheet: species, class, background, ability scores (standard array, point buy, or rolled), equipment, spells, review. A **Level up** flow handles HP, new features, subclass, ASI or feat, and spells.

The data gap is the real work. Class records today are for browsing: per-level features as text, plus slots and counters (`DATA-FORMATS.md` §2.12). A builder needs structured progression: choices, proficiencies, subclass levels, ASI levels, spells known or prepared. Add a typed rules layer in `packages/rules/src/character/`, starting with the SRD 5.2.1 classes, species, backgrounds and feats, written from the SRD text fetched at build time and nothing else (ground rule 3). Imported classes work in the sheet by manual entry until the layer can describe them.

### Editions

The GM already sets the edition: every campaign has `preferredEdition` (2024 by default) and `allowLegacy`. The pack and the table connection carry both, and a character linked to a campaign follows them. A character built outside any campaign picks its own.

- **The sheet** works for either edition from the start: each sheet is marked `2014` or `2024`, the maths is nearly the same, and every number can be overridden.
- **The 2024 builder comes first.** When the campaign allows legacy content it also offers older options (2014 or imported species, backgrounds and subclasses), applied by the 2024 rules' own guidance for older content, with manual entry where the data cannot describe one.
- **The 2014 builder follows it** as its own phase: the 2014 SRD's class tables written into the rules layer, and the same screens with branches for where ability increases come from, subclass levels, feats and weapon mastery.

The rules layer is keyed by edition from the first commit so the second engine is an addition, not a rewrite. Check what SRD 5.1 holds that SRD 5.2.1 does not against the fetched snapshots before sizing the 2014 phase.

The sheet schema and the derived-number functions come first; the PDF import and the builder both write sheets, so they can proceed in parallel once it lands. Give the builder its own short spec before starting it.

## Data model for Part 3

```
Trifold Library/
  characters/
    <characterId>.json          the player's sheets
```

A new file kind, `character`, at version 1. Characters rank in memory in global search. Backups pick the folder up with no change. A character exports on its own as a JSON file the player can carry to another install. One character can be linked from several joined campaigns; each GM accepts its numbers separately.

---

# Reuse map (Parts 1 to 3)

| Area | Status | Where |
| --- | --- | --- |
| Per-device views, intents, claims, drag locks, summons | Reuse; add `turn` | `packages/rules/src/table/` |
| Snapshot built by the console, applying intents | Reuse; add each creature's turn state; apply accepted sheet offers | `features/players/snapshot.ts`, `applyIntent.ts` |
| Table server | Reuse as is for Part 1; content sync, `roll` and `rolled` in Part 2; `sheetOffer` and `sheetAnswer` in Part 3 | `main/table/hub.ts` |
| Shared-with-players list, Export for players | New (Part 2) | `features/campaign/`, `main/campaign/packages`, `packages/importers/src/campaign/` |
| Shared source in a joined campaign | New (Part 2) | `main/joined/`, `main/sources/`, `main/index/` |
| Dice | Change (Part 2): Table and Private, table rolls in the log | `features/dice`, `packages/rules` dice |
| mDNS responder | Change: advertise the table as a service (port, campaign id and name) | `main/table/mdns.ts` |
| Table discovery | New | `main/joined/discovery.ts` |
| Map, screens, overlays for players | Move to a shared folder; check panel widths | `web/MapView.tsx`, `ScreenView.tsx`, `TvOverlays.tsx` |
| Creature tools, picker, companions, initiative box | Move to a shared folder; console-scale styles | `web/tools.tsx`, `Picker.tsx`, `AddCompanion.tsx`, `Playing.tsx` |
| Phone page | Change: your turn and you're next in the summary | `web/Playing.tsx`, `tools.tsx` |
| Compendium, dice, quick notes | Reuse behind a campaign-free seam | `features/compendium`, `dice`, `campaign/QuickNotesTool.tsx` |
| Web tabs | Reuse as is | `shell/WebTabPage.tsx` |
| Schemas, migrations, `LibraryStore`, backups | Reuse | `packages/schema`, `main/library/`, `main/backups.ts` |
| Phone connection | Change: split into `TableClient` | `web/connection.ts` |
| Shell | Change: `Stage` and `Dock` take their registries; player kinds and layouts | `shell/`, `schema/library.ts` |
| Campaign list | Change: Running and Playing | `features/library/CampaignsPage.tsx` |
| Player devices pop-up | Change (Part 3): sheet offers, auto-accept | `features/players/PlayerDevices.tsx`, `main/table/players.ts` |
| Media scheme | Change: a `table` host | `main/media.ts` |
| First run | Change: player-friendly copy | Library setup |
| Joined campaigns, `LanClient`, image cache, offline view, player console | New | `main/joined/`, renderer `features/joined/` |
| Character sheet, builder | New | `packages/rules/src/character/`, renderer `features/character/` |
| PDF sheet import | New | `packages/importers/src/pdfSheet/` |

# Phases and task order

One feature per PR (`CLAUDE.md`), and each phase updates its own docs and ADR as it lands. After phase 5, the PDF import and the builder run in parallel.

1. **Seams, no behaviour change.** The `TableClient` split in `web/connection.ts`; the picker taking the device's name and the initiative box exported; player kinds and the player layout in the schema with no UI; the feature flag (`TRIFOLD_PLAYER_MODE=1`, read through `app.getInfo`). All existing tests and the smoke test stay green and unchanged. Built.
2. **Player mode on the LAN.** First, as PRs with no behaviour change: the shell's two roles (built), and the components both clients use moved to a shared folder. Then the service advertisement and table discovery; Join a campaign, the joined-campaign store and the Playing list; `LanClient` and `BridgeClient`; the `table` media host and image cache; the player console with Table, My characters, Initiative, Quick notes, Dice and Compendium; then the offline view, finding the table again, the failure messages and the sharing-backups warning. Its ADR and the ground rule 1 change. The flag comes off when this phase's acceptance passes.
3. **Table rolls.** The Table and Private switch, `roll` and `rolled`, table rolls in both roll logs. Its ADR.
4. **Shared content and player packs.** The Shared sources list, the shared source in a joined campaign, sync on connect, Export for players and opening a pack. Its ADR, with the `DESIGN.md` §8 change.
5. **Character foundation.** The sheet schema (marked by edition, linked records by key and name) and derived-number functions in `packages/rules/src/character/`, the Library's Characters page, the Sheets tab for the PC, the Table numbers form, the `sheetUrl` migration, and the `sheetOffer` flow with Accept, Dismiss and auto-accept. Its ADR.
6. **PDF sheet import** (parallel with 7). Real exports first, then field mapping, the preview, manual matching and re-import.
7. **Character builder, 2024** (parallel with 6). Its own short spec first, then the SRD 5.2.1 rules data, legacy options, the creation flow and the Level up flow.
8. **Character builder, 2014.** The SRD 5.1 rules data and the 2014 branches of both flows.
9. **Docs and tests throughout.** The ADRs with their index and decision log rows (the Players and User content rows change); `DESIGN.md` §1 (it opens by calling the app a DM console), §1.1, §1.2, §4.1, §4.2, §4.4, §5.2, §6.5, §8 and §10 (the PDF import leaves Later); `PLAYER-CONNECTOR.md`; `CLAUDE.md` ground rule 1 and the repo layout; `docs/README.md`; and the user guide (joining from the app, the player console, characters). A smoke spec runs a second app instance with its own user-data folder and Library against the first one's table server.

# Acceptance (Parts 1 to 3)

Done when these pass on Windows 11 and macOS, along with `pnpm test`, `typecheck`, `lint` and `smoke`.

- [ ] A player on the same network opens Join a campaign, sees the GM's table listed by campaign name, presses Join, claims a PC, moves its token and changes its HP; the GM's console and TV update.
- [ ] The same works by typing the address the GM shows, with the search blocked.
- [ ] Stopping the table takes it off other players' Join lists within a few seconds.
- [ ] A player's Library restored from a backup on another computer opens the joined campaign on the same characters, with no picking and no GM action.
- [ ] The player's Trifold appears in the GM's device list and obeys the reclaim mode, movement locks, Give to… and Release like a phone.
- [ ] Hidden tokens, fogged areas and the original map image never reach the player console (the same checks as the phone page, on the frames the app receives).
- [ ] The player console never loads GM campaign data: `useCampaignStore.current` is null and the combat, presenter and scene stores are empty while a joined campaign is open.
- [ ] The GM's table hotkeys do nothing in the player console.
- [ ] On the player's turn the strip says "Your turn", and one turn earlier "You're next", with the Initiative strip overlay on and off, in the app and on a phone.
- [ ] Closing and reopening Trifold, the player opens the joined campaign and is back on their character with no picking, also after the GM's port or address changed.
- [ ] Opening a joined campaign while the GM's table is down shows the offline view with the last map, then goes live on its own when the table comes up.
- [ ] With the GM running a different campaign, the player sees the another-campaign message, not an error.
- [ ] With neither Join a campaign nor a joined campaign open, Trifold sends no search and opens no connection to any table; it never connects to an address that is not private.
- [ ] A Table roll from a player shows the same result in the GM's roll log and another player's; a Private roll sends nothing, checked on the frames.
- [ ] A shared source gives a player its spells and items and none of its creatures; an unshared homebrew record never reaches a player; a creature in an encounter never does unless it is on the companion list or held by that player.
- [ ] A player opens a pack with no network, sees the campaign under Playing with its compendium, then joins the table at the first session into the same shell.
- [ ] Shared records cannot be edited, duplicated or exported, and are gone after Leave campaign.
- [ ] A character with an option from shared content, unlinked from the campaign, keeps its numbers and option names, shows the text as no longer available, and resolves again after the player imports their own copy.
- [ ] A player's level-up reaches the GM as a sheet offer; Accept updates the PC card and Dismiss leaves it.
- [ ] A PDF sheet exported from at least one external builder imports its table numbers after the player confirms the preview.
- [ ] Existing LAN connector tests and `smoke/players.spec.ts` pass unchanged.
- [ ] An install updated from the previous release keeps its PC cards (the `pc` migration).

---

# Part 4: Remote play (paused)

Not to be built until Parts 1 to 3 are built and working. This part records the design so far and what has been decided, so the work in Part 1 does not close it off. It gets its own ADR and its own pass against the code before anyone starts.

## The design in brief

- Off-site players connect to the GM's Trifold peer to peer with Hyperswarm in the main process. The LAN table server stays as it is.
- **Host side.** `hub.ts` holds each device's `WebSocket` in its `Client` record (`send`, the `readyState` checks in `answer`, the ping and pong heartbeat, `close(1001)` on stop). A `TableConnection` interface (`kind`, `publicKey?`, `open`, `send`, `onMessage`, `onClose`, `close`) makes the WebSocket one implementation, and a `RemoteHost` beside the HTTP server adds the other. Parsing, the 16 KiB cap, the rate limit and the unchanged-view check stay in the hub for both.
- **Player side.** A `RemoteClient` in main behind the same `BridgeClient` Part 1 builds. The renderer does not change.
- **Identity.** A remote device is its public key, proved by the encrypted handshake; no token. An unknown key gets `pending` and nothing else until the GM lets it in, whatever the reclaim mode; claims then follow the reclaim mode. `PlayerDevice` in `players.json` becomes a union on `transport` (`lan` with `tokenHash`, `remote` with `publicKey` and `fingerprint`), through a `players` migration from 1 to 2. A removed key is kept, marked, so the host can answer `removed`.
- **Invites.** An invite link (`trifold://join?h=<host key>&c=<campaign id>&n=<name>`) and a four-word join code as the typed fallback, hashed into a topic. The link is untrusted input and is checked before use; `second-instance` only focuses the console today and nothing reads `process.argv`; the portable exe and dev runs do not register the protocol.
- **Messages.** `join`, `pending`, `joined`, `denied`, `removed`, `notHosting`, `imageGet`, `imageChunk`, in the existing camel-case naming.
- **Pictures.** Sent over the stream into the same image cache. The host serves a path only if it is in the last view sent to that device. That is stricter than the HTTP routes, which cannot tell devices apart.
- **Spike first.** Hyperswarm's native addons have to load and complete a real encrypted connection inside the pinned Electron, dev and packaged, on Windows x64, macOS arm64 and macOS x64 with no compiler; the installers and the update path have to survive it; and CI needs a local DHT so tests never touch the public one. Check the same-network case too.

## Decided

- **The identity key is per Library and is included in backups** (Ian, 2026-11-22). It lives in the Library, so a restored Library keeps its invite links and its players, and a player restoring a Library is still let in. Because of that, the one sharing-backups warning in Settings › Backups (Part 1, Claims follow the Library) gains a line from the moment a Library has a key: anyone who gets a copy of a backup, or of the Library folder if it is synced, could pose as this GM to its players.
- **Order of work:** after the player side (Ian, 2026-11-22).

## Still open for this part

- **What turning remote play on says.** Peers find each other through a public distributed hash table whose bootstrap nodes are run by the library's maintainers, not by this project. Those nodes and other participants see both sides' IP addresses, and the GM and each player see each other's. No game data passes through them. Recommendation: accept it, on three conditions. It is off until the GM turns it on per campaign; the Player devices pop-up says the above in two plain sentences the first time; and the docs stop describing the app as local only without qualification (ground rule 1 and DESIGN §1.2 would say "local, with optional peer-to-peer remote play"). The bootstrap addresses stay inside the dependency, so the repo still names no site.
- **No relay.** When hole punching fails the connection fails, and the fallback is a VPN the players set up themselves. The user guide has no such section yet.
- **The join code's word list.** Write our own, or carry an openly licensed list with its notice.
- **GM name.** There is none anywhere today; the join answer needs one, typed once.
- **Same-network app players.** Part 1 already gives them the LAN path, so remote play does not have to work between two machines on one network.

# Open questions

None block phases 1 to 3.

- **Legal review.** Sharing a GM's imported, non-SRD source with players copies it to their machines. Ian's view is that the responsibility is the GM's; the plan keeps the warning and the opt-in. Worth a lawyer's hour before a public release (the itch.io beta).
- **Where table rolls show.** The roll logs for now; a dedicated element in both consoles is wanted later.
