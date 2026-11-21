# Player connector

Players at the table open a page in their browser, served by the DM's Trifold, claim a character
in the campaign and look after a few things for it: HP, temp HP, max HP, AC, conditions,
initiative, its position on the map and its companions. Players keep their real character sheet
wherever they like; Trifold tracks only what the table needs. There are no accounts and no
cloud. The server runs on the DM's machine, on the local network, only while the DM has it on
(see ADR 0043).

The DM keeps authority throughout: the console owns every piece of game state, a player's change
is a request the console applies, and the DM can see, change, release or take back anything.

| Part                         | Where                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Server, devices and claims   | `apps/desktop/src/main/table/` (`hub.ts`, `listen.ts`, `mdns.ts`, `players.ts`)        |
| Pure rules                   | `packages/rules/src/table/` (views, claims, intents, movement, summons, ports)          |
| Wire types                   | `packages/rules/src/table/types.ts`, re-exported from `@trifold/api`                   |
| The player page              | `apps/desktop/src/web/`, built by `vite.web.config.ts` into `out/web/`                 |
| Console side                 | `apps/desktop/src/renderer/features/players/` (snapshot, fog image, intents, summons)  |
| Stored data                  | `players.json` and fields in `packages/schema/src/campaign.ts`                          |
| Smoke test                   | `apps/desktop/smoke/players.spec.ts`                                                    |

## Boundaries

- **Off until the DM starts it.** Let players join starts the server for the open campaign; Stop,
  closing the campaign or quitting ends it and tells every page the table is closed.
- **Private LAN only.** One listener per private address (IPv4 10/8, 172.16/12 and 192.168/16,
  plus IPv6 link-local and unique-local), never `0.0.0.0`. Requests from any other remote address
  are refused. No UPnP and no port forwarding.
- **Only Trifold's own addresses.** Every request's `Host` header must name an address Trifold
  shows, which stops a web page elsewhere from reaching the server through a rebound DNS name.
  The WebSocket upgrade must also come from the same origin and ask for `/ws`.
- **Strict headers.** The page is served with a CSP of `default-src 'self'` and
  `connect-src 'self' ws://<host>`, plus `nosniff`, `no-referrer` and `same-origin` resource
  policy. SVG art gets its own `default-src 'none'` policy.
- **Each device sees only what it may.** Filtering happens on the server, never in the page (see
  [Server-side filtering](#server-side-filtering)).
- **Tokens are never stored or logged.** Only a SHA-256 hash of each device token is kept, and it
  is compared in constant time.
- **Every message is checked.** Client messages are parsed with Zod schemas in `hub.ts`; each
  intent is checked for ownership, field, range, locks and settings before it reaches the console.
  Messages are capped at 16 KiB and 30 a second per browser.
- **Releasing, reclaiming or disconnecting never changes creature data.**

## Server and addresses

The server is Node's built-in `http` with `ws` for the WebSocket, `multicast-dns` for the local
name and `qrcode-generator` for the join code, all pure JavaScript. It serves only the player
page's built files, the fogged map image, pictures for things a device can see, and `/ws`. The
interface list is re-read every 10 seconds, so listeners follow DHCP and Wi-Fi changes.

### Ports

Trifold tries port 80 first, so addresses need no port, then 8130 to 8139, taking the first that
is free (`EADDRINUSE` and `EACCES` both move on). The working port is saved in the app config,
not the campaign, and reused every session; once 80 has failed it is not tried again. The port is
part of the browser origin that players' tokens are stored under, so a change means players pick
their characters again; the Player devices pop-up says so when it happens. Ports 3000, 5000,
7000, 8000 and 8080 are avoided because dev tools and macOS AirPlay Receiver often hold them.

### Local name

While the server runs, Trifold answers mDNS for `trifold.local` (A and AAAA). It probes the name
first and, if another host answers, tries `trifold-2.local` and so on, showing the name it won. It
answers legacy unicast queries (source port other than 5353, answered by unicast with the query
id echoed, RFC 6762 §6.7), which Android's resolver depends on. The name is a convenience: if
multicast is blocked, the IP address, Copy link and reclaim all still work.

### Joining

The Player devices pop-up shows a QR code, the local name in large text and the IP address
below it, always with `http://` and with the port when it is not 80 (some browsers treat a bare
name as a search). The QR always encodes the IP address. Copy link copies both addresses for the
group chat. Show join code on TV puts a large QR and the address on the TV until it is unticked;
it is off by default and not saved across restarts. The server serves the one open campaign, so
the address needs no campaign id.

### Firewall and Wi-Fi

Before the first start the pop-up says the computer may ask whether Trifold can accept
connections, and to allow it on private networks. If nobody connects within a minute of
starting, it says the firewall or the Wi-Fi may be in the way and suggests a phone hotspot. The
player page's joining screen says the same: guest and school Wi-Fi often keep devices apart.

## Who owns what

The console's stores own the state, main relays and filters, and browsers only render, the same
rule the TV follows. The table server is a second relay beside the player window, not a new
source of truth.

- **The console** pushes a `TableSnapshot` to main whenever the live scene, the fight or a
  claimable creature changes. Phones show only what the TV shows (ADR 0046): until the DM goes
  live the snapshot says `live: false` and carries no map and no screen, and phones keep their
  character tabs and say they are waiting. Live, it carries: the map scene live on the TV, unfiltered (tokens with their refs,
  roles and hidden flags, fog shapes, grid, size); what the TV shows when it is not a map (title,
  image or break); every offered PC and NPC with its HP, temp HP, AC and conditions (from its
  combatant in the loaded fight, else from the PC card or the NPC's carried HP); summons on the
  live map; and the DM's companion list. It also draws the fogged map image.
- **Main** runs the server, holds devices and claims in `players.json`, keeps drag locks,
  approval requests and PIN tries in memory, and builds each device's view from the snapshot.
- **Pure functions** in `packages/rules/src/table/` decide what a device sees (`viewFor`),
  whether a creature is offered (`isClaimable`), what a tap in the picker does (`decideClaim`),
  whether an intent, drop or summon is allowed, and the port order. The fog test
  (`packages/rules/src/fog.ts`) is shared by the console, the TV and main.

### Server-side filtering

Each device receives only:

- its own creatures in full (stats, conditions, what it may edit, whether movement is locked);
- other visible tokens' position, label, role and picture, with masked names already applied;
- nothing hidden, and nothing whose centre is under fog, except the device's own tokens: if the
  DM fogs over a player's token, its owner still sees it (and can only drag it out into a
  revealed area); other phones and the TV do not.

Phones see every revealed area of the live map, not only what the TV's camera frames. A device
holding nothing gets the picker and no map. Pictures are served under the server's own paths
(`/map/…`, `/t/<tokenId>/art`, `/c/<kind>/<id>/portrait`, `/screen/<id>/image`), so no
campaign path or file name reaches a browser. Token pictures are served only for tokens some
connected device can see.

### The fogged map image

Phones never receive the original map. The console draws the scene's display image on a canvas
(longest side 2048 px), fills every fogged area solid black, encodes a JPEG at quality 0.8 and
sends it to main keyed by scene id and an image key, which changes with the fog and with the
picture showing (switching a scene's background gives a new key). Main keeps the latest image in
memory only and serves it at `/map/<sceneId>/<imageKey>.jpg`. Phones also draw the fog shapes
over it for clean edges. A scene with fog off is served the same way, without the black. While a
new picture is on its way, a phone keeps the old one (or the backdrop) under a "Loading map…"
pill, and tries a failed load again after a moment.

### Transport

Each browser holds one WebSocket. On connect the server sends `campaign` (id, name and the DM's
clock); the page answers `hello` with the token it stored for that campaign, if any. After that
the server sends `state` (the device's `ClientView`) whenever it changes, and the page sends
requests. A dropped connection retries with backoff while the page is open, and the page shows
a connection dot.

| Page sends | Meaning |
| --- | --- |
| `hello {token?}` | Identify this device |
| `claim {creatureKind, creatureId, label?, pin?}` | A first claim, reclaim or takeover; the server decides which |
| `intent {creatureKind, creatureId, intent}` | A change to one of its creatures (see below) |
| `switch`, `undo` | Switch character, and take it back |
| `cancel` | Stop waiting for the DM's approval |
| `grab`, `preview`, `hold`, `drop`, `letGo` | Moving a token |
| `releaseOne {creatureKind, creatureId}` | Release one companion |
| `summon {…}`, `dismiss {tokenId}`, `keepSummon {tokenId}` | Summoning |

| Server sends | Meaning |
| --- | --- |
| `campaign` | Which campaign this is, and the DM's clock (for the break timer) |
| `state` | The device's view |
| `token` | A new device token, once, after a first claim |
| `error {message}` | A refusal or notice, shown inline |
| `waiting {creatureName}` | Approval mode: the DM has been asked |
| `released {names, undoMs}` | Switch character released these |
| `grabbed`, `dragEnded {reason}` | A drag may go on, or ended without moving |
| `closed` | The DM stopped the server or closed the campaign |

Main hands the console three kinds of event: `tableIntent` (a checked edit), token events
(preview, preview end, move) and summon events (spawn, dismiss, keep).

## What can be claimed

Players claim PC cards and NPCs. Every PC card is offered unless the DM unticks **Players can
claim this character** on its form; an NPC is offered only once the DM ticks it. The same switch
sits in a PC or NPC token's actions on the map (**Players can claim …**), for a PC token and an
NPC token not marked enemy.

An offered NPC appears in the picker while none of its tokens on the live scene, nor its
combatant in the running fight, is marked enemy; with no token and no fight the flag alone
decides. An NPC placed from its own list starts neutral, so it is claimable; one that arrives in
an encounter or by Track as NPC starts as enemy, and becomes claimable once the DM marks it ally
or neutral. A compendium stat block placed straight on the map is a creature token, not an NPC,
and cannot be claimed: to hand one to a player, the DM makes a campaign NPC that points at it.
Copying a PC or NPC from another campaign copies its flag but never a claim or a device.

## Claiming, reclaiming and releasing

Identity is "this device holds the key for this character". There are no player accounts.

### First claim

The player opens the address, optionally types a device name ("Sam's phone", remembered on the
device) and taps a character in the picker. The server creates a 128-bit random token
(base64url), stores its SHA-256 hash with a new device, records the claim and sends the token
once. The page keeps it in `localStorage` under `trifold:<campaignId>`. In PIN mode the player
first chooses a 4-digit PIN.

On every later visit the page sends its token; a device that holds claims goes straight to its
characters, and one with none goes to the picker. A dropped connection keeps the claim: the
character stays on the map, the DM can drive it, and the device shows offline in the list.

### Reclaim and takeover

Tokens get lost (a new address, cleared site data, Safari's storage eviction, a new phone), so
the picker also shows claimed characters, marked In use. Tapping one held by an offline device is
a reclaim. Tapping one held by an online device first asks "Brannoc is in use on another device.
Take over?" Either way the campaign's reclaim mode, set under **Getting a character back** in
Player devices, then applies:

| Mode | Shown as | What happens |
| --- | --- | --- |
| Open (default) | Open: just tap it | Granted at once |
| PIN | PIN: set at the first pick | The PIN set at the first claim is asked for; five wrong tries lock that character's PIN for a minute. A claim with no PIN goes to the DM instead |
| Approval | Ask me first | The page waits ("Asked the DM for …"); the request sits in Player devices with Accept and Deny |

PINs are stored on the claim as a salted scrypt hash. A successful reclaim moves the claim to
the asking device (a new device gets a fresh token), and the old device drops to the picker with
a short note.

### Releasing

- **Switch character** in the page's header releases everything the device holds and shows
  "Released Brannoc" with **Undo** for 5 seconds. Undo takes them back without the reclaim mode
  as long as nobody else claimed them meanwhile.
- A companion can be released on its own from the Companions tool.
- The DM releases any character from the device list, its form, or **Release all**.

A released character goes back to normal DM control; nothing about it changes.

### Give to…

The DM can hand any PC card or NPC to a connected device with **Give to…**, on the selected
token's actions on the map and on the PC and NPC forms. It moves the claim (the old device, if
any, drops it), bypasses the reclaim mode and the player-controllable flag, and takes a PC's
companions along. Taking it back is Release.

### Companions

An NPC can be a **Companion of** a PC, set on the NPC form: a ranger's beast, a familiar kept as
an NPC. Claiming the PC also claims its companions that no other device holds; releasing the PC
(Switch character, DM release, a takeover) releases the companions the same device holds. A
companion is on the table with its PC whether or not it is offered in the picker.

## What the phone shows

The page is mobile first, from 360 px wide, with 44 px touch targets and nothing that needs
hover. It uses the app's own tokens and fonts (see [TOKENS.md](TOKENS.md)), with tint pairs for
damage, healing, temp HP and active conditions.

**Layouts.** The page picks one of four layouts from the viewport's size and shape, live on
rotation (`useLayout.ts`):

| Layout | When | Shape |
| --- | --- | --- |
| Phone portrait | Narrow (under 600 px), or portrait under 700 px wide | Header, map, a one-row character strip and a bottom tab bar; tools open as a bottom sheet |
| Phone landscape | Short and wide (under 500 px tall) | Map left, a tool rail right, a panel between when a tool is open; name and Switch float on the map |
| Tablet portrait | Portrait, at least 700 px wide | Map above a split panel: character card and tool grid beside the open tool |
| Wide | Everything else | A permanent right panel; Health is open by default |

**Header and summary.** The campaign name, a connection dot and Switch; then the character
summary: portrait or initials, name, conditions as text, an HP bar, temp HP and AC.

**The map.** The live map as SVG: the fogged image, grid, fog shapes and tokens. One finger on
one of the player's own tokens drags it; one finger anywhere else pans; two fingers pinch-zoom
and cancel a drag. **Center on my token** and **Full-screen map** sit on the map. When the TV
shows a title card, an image scene or the break screen (with its countdown), the phone shows the
same; the break screen covers a live map, as it does on the TV. With nothing on the TV, the phone
says so.

**Tools.** Four tools, one open at a time. Health, Conditions and Move work on the character
chosen in their target chips: the character first, then each companion in play.

- **Health:** current, max and temp HP; an amount with − and + and **Damage**, **Heal** and
  **Temp**; tabs for max HP and AC with **Save** buttons, where those are editable.
- **Conditions:** the 14 SRD conditions as toggles and an Exhaustion stepper, at any time
  (ADR 0049). Outside a fight they go on the character's card and come into the next fight.
- **Companions:** every companion in play, NPC companions and summons, each with Remove, which
  asks in the row first; and **Add a companion** (see [Summoning](#summoning)).
- **Move:** "Drag the token, or tap where it should go." With Move open, a tap on the map sends
  the chosen token there through the same grab and drop as a drag. On a phone in portrait, Move
  sits under the map with Cancel and Done. "Movement locked by the DM" shows when it is.

**Initiative.** When the loaded fight is waiting for a claimed character's initiative, a card
with one number box and Submit floats over the top of the map (see
[Initiative](#initiative)).

## How a player's edit travels

A page sends an intent. Main checks it (the device holds that character or its owner, the field
is editable now, the value is in range) and forwards it to the console as a `tableIntent` event.
The console applies it through the same store actions a DM click uses, in its one thread, so
player and DM edits are applied in order. The result reaches every screen the usual way: the
console saves, the TV and the snapshot update, and main sends each device its new view. The fight
log names the device ("Sam's phone: …"). A refused intent gets an inline message on the page and
a log line, never a change.

| Intent | In the loaded fight | Outside it |
| --- | --- | --- |
| `hp {delta}` | Damage or heal on the combatant, so concentration checks and death saves still fire | The PC card's HP or the NPC's carried HP, clamped to 0…max; damage takes temp HP first |
| `temp {delta}` | The combatant's temp HP, at least 0 | The PC card's (or NPC's carried) temp HP |
| `setTemp {value}` | Sets temp HP; 0 clears it | The same |
| `maxHp {value}`, `ac {value}` | The combatant | The PC card; an NPC's come from its stat block and are not editable outside a fight |
| `addCondition {name, level?}`, `removeCondition {id}` | The combatant | Refused |
| `initiative {value}` | Sets it only while it is still empty | Refused |

Main enforces: deltas within ±999, temp HP 0 to 999, max HP 1 to 999, AC 0 to 40, initiative −20
to 60, condition names from the shared list in `packages/rules` (`CONDITION_NAMES`), and
Exhaustion levels 1 to 6. Summons follow whoever holds their owner and take the same intents.

### Initiative

A creature is marked `needsInitiative` while the loaded fight has its combatant with no
initiative. The player types the number they rolled (the app never rolls for them) and taps
Submit; the box goes and the number lands in the tracker. If the DM types it first, the box goes
too. Only the loaded fight counts: a paused fight asks again when it is loaded. Only the DM
changes initiative after that.

## Movement

Main owns the drag locks, in memory only; the console applies every move.

### A drag, start to finish

1. **Grab.** A finger down on one of the player's own tokens sends `grab`. Main grants a lock when
   the device holds the token's character (or the summon's owner), the token is not hidden,
   movement is not locked, and no other device is dragging it. Other phones see the token marked
   as moving, with the device's name.
2. **Drag.** The page moves the token locally and sends `preview` at most ten times a second.
   Main forwards previews to the console, which shows them on the console map and the TV, with a
   ruler from where the move began, without saving anything. A preview whose centre is under fog
   shows nothing on the TV. Previews and `hold` keep the lock alive; after 3 seconds without
   either the lock lapses and the console drops the preview. The page keeps its planned move, and
   its next `hold` or `drop` takes the lock back while the token is still free and still theirs.
3. **Drop.** `drop` carries where the token was when the drag began. Main refuses it, and the page
   snaps the token back with a one-line reason, when another device holds the lock, the token has
   moved since (someone else moved it), the spot is off the map, or the token's centre would land
   under fog. Otherwise the drop snaps to whole cells and the console moves the token through the
   same path the tracker uses: the scene saves and the TV and every phone follow.
4. **DM priority.** When the DM starts dragging a token a player is moving, main ends the
   player's drag at once; the page snaps back and says "The DM moved Brannoc." The DM never waits.

Moving, placing or summoning never reveals fog: only the DM changes fog.

### Locking movement

**Lock movement** in Player devices locks everyone; the lock button beside each claim in the
device list locks one character (and its summons). Both are saved in `players.json`. Locking
ends any drag already under way, and the page shows "Movement locked by the DM". Players can
move whenever movement is not locked; there is no turn rule, as at a physical table where the DM
keeps order.

## Summoning

A summon is a token on the live map with a `summon` record (owner PC or NPC, the device that
summoned it, its type, HP and AC outside a fight, initiative mode, round it expires, whether it
is tied to concentration, whether it stays after the fight). In the loaded fight it is also a
combatant. It belongs to whoever holds its owner, so it has no claim of its own: give the PC to
another phone and its summons go with it.

**The companion list.** Players can add only creatures the DM put on this campaign's list
(`settings.summonable`), which keeps enemies and dragons out of reach without asking the DM each
time. The DM manages it in **Campaign › Companions**: add from the compendium, make a new
creature, or customise a stock one, which makes the campaign's own copy so the compendium's
original never changes. **Available as a companion** on a creature's compendium page adds to the
same list.

### Add options

**Add a companion** on the phone opens a searchable list. One tap adds one; **Options** sets how
many (numbered copies, "Skeleton 1" to "Skeleton 4"), initiative (**Shares my turn** or **Rolls
its own**, which puts an initiative box on the phone), how long it **Lasts** (until dismissed,
or a number of rounds), **Tied to my concentration**, and **Stays after the fight**. The page
remembers each player's last options per creature.

New tokens go in the nearest free, revealed cells around the owner. A summon needs a map on the
TV with the owner on it.

### DM guardrails

In Player devices, saved in `players.json`:

- **Player summoning:** On, Ask me first (a request in the device list with Accept and Deny), or
  Off.
- **Most per character:** 8 by default, 1 to 20.

The console shows each summon's owner and the device that summoned it on its token's actions,
the fight log names the device, and the DM can edit, move or delete any summon. Upkeep runs on the console: when a round passes,
summons whose rounds are up go and are logged; when an owner's concentration breaks, summons tied
to it are marked and the owner's phone asks whether to take each out of play or keep it; when a
fight ends, summons that do not stay go. Removing a summon from the phone removes its token and
combatant; nothing in the campaign is deleted.

## What the DM controls

Everything lives in the VTT tab's **Player devices** pop-up, beside Overlays and Break, except
the per-character controls on forms and tokens. Starting the server is not a table-time action,
so it has no hotkey.

- Let players join and Stop; the QR, addresses and Copy link; Show join code on TV.
- Requests waiting for approval, with Accept and Deny.
- Lock movement, for everyone.
- The device list: each device's name, online or offline, what it holds, and per character a
  movement lock and Release; Release all.
- Getting a character back (the reclaim mode).
- Player summoning and Most per character, with a count of the companion list.

On each PC card and NPC form: Players can claim this character, Give to…, and the current claim
with Release. On the NPC form: Companion of.

There are no toasts. Quiet events (reconnects, takeovers, summons) change only the device list.
A waiting request puts a dot on the Player devices button, the VTT tab and the live strip's VTT
section. The DM can edit any field of any creature at any time, and DM edits always win.

## Concurrency

Trifold is the only writer, so data cannot be corrupted. These rules keep tokens from jumping and
edits from being lost:

- **Serial application.** Every intent, from the console and every device, is applied in the
  console's one thread, in order.
- **Changes, not totals, for counters.** HP and temp HP damage and healing travel as changes
  ("−7", "+5"), so a DM's damage and a player's healing both apply. Max HP and AC are absolute and
  the last write wins. Temp HP set with **Temp** is absolute too, which is safe because temp HP
  never stacks.
- **Drag locks, DM priority and a stale check on drop** cover positions (see
  [Movement](#movement)). There is no version field: a drop's starting position is the stale
  check, and positions are the only thing players write absolutely and at the same time.
- **The server's view is final.** The page shows a change at once and takes the next `state` as
  the truth.

## Stored data

| What | Where | Notes |
| --- | --- | --- |
| Devices | `campaigns/<slug>/players.json` | `deviceId`, `tokenHash`, `label`, `lastSeen` |
| Claims | `players.json` | `creatureKind`, `creatureId`, `deviceId`, `claimedAt`, `pinHash?` |
| Reclaim mode, movement locks, summoning mode and cap | `players.json` | Main enforces them |
| Players can claim | PC card and NPC, `playerControllable` | Absent means on for a PC, off for an NPC |
| Companion of | NPC, `companionOf` | A PC id |
| Summon | Token, `summon` | Owner, device, HP and AC, initiative, expiry, concentration, persistence |
| Companion list | Campaign settings, `summonable` | Name, type, size, AC and HP cached |
| Port | App config, `tableServerPort` | Not per campaign: it is part of the players' origin |

`players.json` is written only by main, through `LibraryStore`. The console saves whole PC and
NPC files, so if main also wrote claims into them, one side's save would erase the other's
change; one writer per file avoids that. Every change is saved before it is answered. The
fogged map image, drag locks, approvals, PIN tries and the undo grace are never written.

Start, stop, the port, the local name, claims, takeovers, releases and refused requests are
logged through `log.ts`. Tokens never reach the log.

## Tests

- `packages/rules/src/table/*.test.ts`: `viewFor` (fog, hidden tokens, masked names, the owner
  exception), the claimable test, intent checks and ranges, every reclaim mode, PIN lockout, drag
  locks and expiry, drop checks, cells beside the owner, summon numbering, the cap and modes.
- `packages/rules/src/table/table.test.ts` also covers port order, private addresses and the
  `Host` check.
- `apps/desktop/src/main/table/table.test.ts`: `PlayersStore` (token hashes, PINs, takeovers,
  Switch character, movement locks and the reclaim mode saved to `players.json`), LAN address
  listing, port fallback and the mDNS responder's answers and conflicts.
- Renderer tests in `features/players/`: the Player devices pop-up, applying intents in and out
  of a fight, previews and moves, summon upkeep.
- `smoke/players.spec.ts`, on Windows and macOS: the sample campaign; joining, claiming,
  reconnecting; WebSocket frames never carrying a fogged token or a hidden NPC's name;
  initiative, damage and conditions from the phone; Switch and Undo; a takeover in Approval mode;
  dragging, a drop under fog, the DM's grab, movement locks, Give to…; summoning, numbering,
  removal and an approval-mode summon.

## Not built yet

- Editing a character's name or portrait from the phone. A portrait would be an upload saved as
  the character's creature art, shrunk to 512 px like other art.
- Changing the table server's port in Settings.
