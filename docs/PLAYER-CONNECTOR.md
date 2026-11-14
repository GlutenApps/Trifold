# Player connector

**Status:** proposed, not built. Beta item 14 (`DESIGN.md` §10, ADR 0032). Spec from the DM, 2026-11-12.
The [decisions](#decisions) below settle where the original spec and the repo disagreed; where
they differ from a later section, the decisions win. Before Phase 1 starts, a Phase 1 plan is
confirmed and an ADR amends `DESIGN.md` §1.2 and `CLAUDE.md` ground rule 1.

Players at the table open a browser page served by the DM's Trifold, claim a creature in the
campaign, and control a few basics for it: HP, AC, conditions, initiative and its position on the
map. Players build their real characters wherever they like (another app or paper); Trifold
tracks only what the table needs. No accounts and no cloud: the server runs on the DM's machine,
on the local network, only while the DM has it open.

## Decisions

Settled with the DM on 2026-11-13. The original spec's wording is kept below; these win where
they differ.

1. **What can be claimed.** Trifold has no single creature entity: PCs are PC cards (carried HP,
   ADR 0012), named NPCs are NPCs, a fight has combatants and a map has tokens. A **PC card** can
   always be claimed. An **NPC** can be claimed while its token or combatant is not marked enemy
   (the existing ally / enemy / neutral role; NPCs get no new hostility field). The claim fields
   (`playerControllable`, `claim`, `version`, presets) live on the PC card and the NPC; tokens
   and combatants follow their ref.
2. **What can be summoned:** anything that is not a PC or an NPC: a compendium creature or a
   custom entry (the existing `EntityRef` kinds), placed as a token and, in a fight, a combatant,
   with `parentId` and the spawn record on it.
3. **Test campaign:** the bundled sample, The Lantern at Greyford (ADR 0016). See the test setup
   at the end.
4. **No toasts** (`CLAUDE.md`). Quiet events (reconnects, takeovers, spawns) only change the
   device list: online or offline, who holds what. Approval requests put a dot on the Player
   devices button, the VTT tab and the strip's VTT section, and Accept and Deny sit in the list.
5. **Where it lives: inside the VTT tab**, not a dock tool. The tab's header toolbar gets a
   **Player devices** button that opens a pop-up, like overlays, handout and break (ADR 0008,
   0009). The switch is **Let players join** / **Stop**. Revisit if testers find it hard to reach.
6. **Join code on the TV:** a **Show join code on TV** checkbox in the Player devices pop-up, its
   one home (not repeated in Overlays). It shows a large QR and the address on the TV until
   unticked. Off by default.
7. **Ports:** 80 first; if taken, 8130, then 8131–8139, the first that is free. The working port
   is saved and reused every session; 80 is not retried. (3000, 5000, 7000, 8000 and 8080 are
   avoided: dev tools and macOS AirPlay Receiver commonly hold them.) Whether macOS lets an
   unprivileged app bind port 80 is verified on a Mac.
8. **Initiative:** when a fight needs a claimed creature's initiative, the player sees one entry
   box, types the number they rolled (the app never rolls for them) and taps Submit; the box
   disappears and the number goes straight into the tracker. If the DM types it first, the
   player's box disappears too. Summons that roll their own initiative get the same box. Only
   the DM changes initiative after that.
9. **Packages:** an HTTP server, WebSocket, an mDNS responder and a QR generator are approved,
   all pure JS (no new native modules). Exact packages and versions are named in the Phase 1 plan.
10. **macOS:** every phase is built and passes its checks on macOS as well as Windows; only the
    public Mac release waits for 1.0 (ADR 0029).

11. **Fog on phones.** The connector stays Beta 14, after fog of war (Beta 7), and Phase 1
    ships with fog. Phones never receive the original map: the console draws the scene's
    display-size image with every fogged area filled solid black (a canvas, no new packages),
    saves it as a JPEG, caches it per fog change, and serves that. Phones also draw the fog
    shapes over it for clean edges. One pure "is this point under fog" function filters tokens
    for the TV and phones and checks player drops. Phones see every revealed area, not only
    what the TV's player camera is framing.
12. **Only the DM changes fog.** Moving, placing or spawning a token never reveals anything.
    A player's drop or spawn whose token centre lands under fog is rejected and the token snaps
    back (the same centre rule the TV uses to hide tokens). Only the drop counts; drag previews
    show the TV nothing while the token is under fog. If the DM fogs over a player's own token,
    its owner still sees it and can only drag it out into a revealed area; other phones and the
    TV do not see it.
13. **Claiming after the 2026-11-13 roadmap changes** (campaign-only stat blocks, copying, the
    NPC form, creature art, "Named"):
    - **Which role counts.** An NPC can be claimed while it is flagged player-controllable and is
      not marked enemy on the live scene or in the running fight. An NPC with no token and in no
      fight is decided by the flag alone. An NPC placed on a map from its own list starts
      **neutral**, so it is claimable; one that arrives in an encounter or by Track as NPC starts
      as **enemy**, so it is claimable once the DM marks it ally or neutral.
    - **Named stat blocks are not NPCs.** A compendium stat block marked Named and placed straight
      on the map is a creature token, not a campaign NPC, so it cannot be claimed. To hand one to
      a player, the DM makes a campaign NPC that points at it.
    - **Copies start unclaimed.** From another campaign… copies the player-controllable flag and
      summon presets but never a claim, a device or a version: devices belong to a campaign.
    - **Portraits are creature art.** A portrait a player sets from a phone is the PC's or NPC's
      creature art (campaign `tokens/`, shrunk to 512 px like every other art, ADR 0033), so it
      shows on every token of that character. A token-only art the DM set still wins on that token.
    - **Summon presets** offer only creatures from sources enabled in this campaign (Beta 5).

## Goals and non-goals

Players get one-tap access to their own creatures on the map; the DM keeps full authority and loses no speed.

**Goals**

- Players join from any modern browser (phone, tablet or laptop) on the same local network, with no install and no account.
- A player claims one or more existing campaign creatures and edits a small set of fields on them.
- Returning players reconnect automatically; when that fails, reclaiming takes about one second.
- Releasing a wrong claim is one tap and never loses data.
- Players can spawn and dismiss their own summons from saved presets.
- The DM can always see, override, take over or release anything, and simultaneous edits never glitch.

**Non-goals**

- No character builder, rules engine or full character sheet. Players keep their real sheet elsewhere.
- No remote or over-the-internet play, relay server or hosted backend.
- No native mobile or desktop player app.
- No player-facing dice roller, chat or handouts (possible later).

## Concepts and data model

All data lives in the campaign on the DM's machine. Players' devices hold only a device token.
"Creature" below means a claimable PC card or NPC, or a summon (decisions 1 and 2).

| Concept | Stored where | Key fields | Notes |
| --- | --- | --- | --- |
| Player-controllable flag | On the creature | `playerControllable: bool` | Only flagged creatures appear in the player picker |
| Claim | On the creature | `claim: { deviceId, deviceLabel, claimedAt } \| null` | One controlling device per creature at a time |
| Device | Campaign | `deviceId`, `tokenHash`, `label`, `lastSeen`, `pin?` | Store a hash of the token, never the raw token |
| Link | On the creature | `parentId: creatureId \| null` | Familiars and summons point at their owner |
| Summon preset | On the parent creature | `name`, `maxHp`, `ac`, `speed`, `image`, `initiativeMode`, `duration?`, `concentration`, `persistent`, `defaultCount` | Player-editable; spawning copies a preset into a new creature |
| Spawn record | On the spawned creature | `spawnedBy: deviceId`, `presetId`, `expiresAtRound?`, `concentrationOf?` | Lets the console show who created it and clean up |
| Version | On every creature | `version: int` | Incremented on every change; used for conflict checks |

Player-editable fields: name, portrait, max HP, current HP, temp HP, AC, conditions and token position, plus submitting an initiative roll once when asked (decision 8). Everything else is DM-only.

## Local server and connection

Trifold hosts a small HTTP + WebSocket server on the local network that serves the player client and is the single source of truth for all state.

- **Off by default.** The DM starts it per session with Let players join in the VTT tab's Player devices pop-up; Stop disconnects everyone.
- **Port selection:** on the first start, try port 80 so addresses need no port. If 80 is taken (IIS, dev tools or Windows' HTTP service often hold it), fall back to 8130–8139 (decision 7). Save whichever port works and keep using it every session; do not retry 80 later. The address and port are part of the browser origin, so changing either loses players' stored device tokens. The port can be changed in settings, with a warning that players will need to reclaim. Test port 80 on macOS separately.
- **Joining:** phones scan a QR code, which always encodes the IP address. Laptops type the local name shown in large text next to it (`http://trifold.local`), with the IP address below it as a fallback in the same format (for example `http://192.168.1.23`). Always display the exact address, including the port when it is not 80, and always with `http://` in front, since some browsers treat bare names as searches. The server serves the one open campaign, so the URL needs no campaign id. A Copy link button lets the DM paste the link into the group chat. The QR and URL show together in the Player devices pop-up, and on the TV while Show join code on TV is ticked.
- **Local name (mDNS):** while the server runs, Trifold announces `trifold.local` on the LAN. If another Trifold already uses the name, add a suffix (`trifold-2.local`) and display that. The responder answers legacy unicast queries (RFC 6762) and both A and AAAA lookups, because Android's resolver depends on them. The name is a convenience only: if mDNS is blocked, the IP fallback, Copy link and reclaim still work.
- **Network binding:** listen on the private LAN interface only. No UPnP, no port forwarding.
- **Windows Firewall:** the first start triggers the firewall prompt. Show a one-line hint beforehand to allow it on private networks, and detect and explain a blocked connection where possible.
- **Join screen help:** guest or school Wi-Fi often blocks device-to-device traffic; a phone hotspot works.
- **Server-side filtering:** each client receives only what it may see: map state within revealed areas and not behind fog, its own claimed creatures in full, and other visible tokens' positions and names only. Never send hidden data and hide it in the client.
- **Transport:** one WebSocket per client. The client sends intents (`move`, `setHp`, `spawn`…); the server validates, applies, increments versions and broadcasts filtered results.
- **Client build:** one lightweight web client bundled with Trifold and served from it, so its version always matches the DM's. Mobile-first, scaling up to tablets and laptops.

## Claiming, reclaiming and releasing

Identity is "this device holds the key for this creature"; there are no player accounts.

**First claim**

1. The player opens the join URL and sees the picker of player-controllable creatures.
2. They tap a creature and optionally type a device label ("Sam's phone").
3. The server creates a random device token (at least 128 bits), stores its hash with the device, sets the claim and returns the token. The client saves it in localStorage, keyed by campaign id.

**Automatic reconnect:** on load, the client sends its stored token. If it matches a device that holds claims, the player lands directly on their creatures.

**Reclaim** (the token is lost: IP change, cleared data, iPhone Safari storage eviction after about a week, or a new device): the picker also shows claimed creatures. Tapping one follows the campaign's reclaim mode:

| Mode | Player action | DM action | Default for |
| --- | --- | --- | --- |
| Open | Tap the creature | None; console shows a quiet notice | Home groups (default) |
| PIN | Tap, then enter the 4-digit PIN set at first claim | None | Groups wanting light protection |
| Approval | Tap, then wait | Accept or deny on the console | Public or convention tables |

A successful reclaim issues a fresh token and retires the old device's claim.

**Takeover:** tapping a creature controlled by another *connected* device shows "Brannoc is in use on another device. Take over?" Confirming moves control to the new device (still subject to the reclaim mode); the old device drops to the picker.

**Release**

- An always-visible "Switch character" button releases the device's whole group and returns to the picker.
- After releasing, show "Released Brannoc — Undo" for 5 seconds.
- Each companion chip can be released on its own.
- The DM can release any creature, or Release all.
- Releasing never changes creature data. A released creature returns to normal DM control.

**Multiple tokens:** a device can control any number of creatures. Claiming or releasing a parent also claims or releases its linked companions. The DM can hand control of any creature to a connected device ("Give to Sam's phone") and take it back.

**Disconnects:** a dropped connection keeps the claim. The creature stays on the map and the DM can drive it. The console marks the claim offline.

## Player spawning

A player-spawned creature is a new creature, linked to its parent and claimed by the spawning device.

- **Presets:** players save summon presets on their character (an owl familiar, a spiritual weapon, skeletons). After that, spawning is one tap.
- **Placement:** new tokens appear next to the parent and the player drags them into position. Placement in areas the player cannot see is rejected.
- **Quantity:** "Spawn ×N" creates numbered copies (Skeleton 1–4), up to the preset's count and the character cap.
- **Initiative:** each preset either *shares the parent's turn* or *rolls its own initiative*, and is inserted into the order accordingly.
- **Duration:** an optional duration in rounds, counted down by initiative. On expiry the summon is removed and logged.
- **Concentration:** a preset can be tied to the parent's concentration. When concentration breaks, prompt the controlling player and the DM to remove those summons.
- **Cleanup:** non-persistent summons are removed when an encounter ends; persistent ones (a familiar) stay.
- **Dismiss:** a dismiss button on each summon chip, plus "Dismiss all summons".

**DM guardrails**

- Campaign setting for player spawning: On, On with DM approval, or Off.
- A per-character cap on active summons (default 8, configurable).
- The DM can edit, take over or delete any spawned creature, and the console shows which device spawned it.

## Concurrency

Trifold is the only writer, so data cannot be corrupted. These rules prevent jumping tokens, rubber-banding and lost edits.

- **Serial application:** all intents, from the console and every client, go through one queue and are applied in order.
- **Drag locks:** starting a drag requests a lock on that token. While locked, other clients see a "moving" indicator and cannot grab it. The lock clears on drop and expires after 3 seconds without a heartbeat.
- **DM priority:** the DM can always grab a locked token. The player's drag is cancelled and their ghost snaps back.
- **Commit on drop:** clients render the drag locally and send the final position on drop. Throttled previews (about 10 per second) may be sent so the TV shows movement.
- **Versions:** each write carries the version it was based on. A position or absolute-value write based on a stale version is rejected, and the client snaps to the current state.
- **Delta edits for counters:** HP, temp HP and similar values are sent as changes ("−7", "+5"), never as totals, so simultaneous damage and healing both apply. Max HP and AC are absolute; last write wins.
- **Optimistic UI with reconciliation:** clients may show a change immediately but accept the server's broadcast as final.

## Player client and DM console

The player client is mobile-first but reads as part of Trifold: the same tokens (Slate and bone, Outfit and IBM Plex Mono, `TOKENS.md`), type scale, icons and component styles, adapted for touch rather than restyled. Build from shared components where the stack allows.

**Player client screens**

- **Picker:** player-controllable creatures with portraits; claimed ones marked, with the reclaim or takeover flow.
- **Main view:** the map (filtered), plus a panel for the selected creature: HP with quick −/+ entry, temp HP, AC, conditions, and the initiative box while a fight is waiting for it.
- **Creature chips** at the top (Brannoc, Owl, Skeleton 1…) switch which token the panel controls. Tapping a token on the map selects it too.
- **Summons:** a spawn menu of the selected character's presets, plus preset create and edit.
- **Persistent controls:** Switch character, connection status, and a clear "Movement locked by DM" state.
- **Layout:** portrait phones from about 360 px wide, scaling to tablets and laptops. Touch targets at least 44 px, primary controls within thumb reach, no hover-only interactions.

**DM console additions**

- **Player devices (a pop-up from the VTT tab's toolbar):** Let players join / Stop, join QR and address with Copy link, Show join code on TV, connected devices with labels and online state, per-device release, Release all.
- **On each PC card and NPC:** the player-controllable toggle, current claim, Give to…, release; on summons, the device that spawned them.
- **Campaign settings:** reclaim mode, player spawning mode, summon cap, lock movement (global and per creature).
- **Notices:** no toasts (decision 4). Quiet events show in the device list; approval requests mark the Player devices button, the VTT tab and the strip, and are one click in the list.
- **Override:** the DM can edit any field of any creature at any time, and DM edits always win.

## Delivery and acceptance

Four phases; each ships something usable and testable at a real table.

**Phase 1: connect, claim and view**

- [ ] DM starts and stops the server from the console; the join QR and address appear on the console and can be shown on the TV
- [ ] A phone and a laptop on the same Wi-Fi open the client with no install
- [ ] Players claim a creature and see the filtered map and their creature's stats, read-only
- [ ] Reopening the page next session reconnects automatically
- [ ] Fogged areas and hidden creatures never reach a client (verified by inspecting WebSocket traffic)
- [ ] On a 360 px portrait phone the client fits with no horizontal scrolling, every control is reachable, and it is recognisably the same visual language as the console
- [ ] A Windows laptop and a Mac join by typing the `http://trifold.local` address shown on the console, and by the IP fallback
- [ ] An Android phone (Android 12 or later) opens the `.local` address typed in Chrome (secondary path; phones normally use the QR code)
- [ ] With port 80 occupied, Trifold falls back to the alternative port, keeps it across restarts, and shows it in every address

**Phase 2: edits, reclaim and release**

- [ ] Players edit HP (as deltas), temp HP, max HP, AC, conditions and initiative; changes appear on the console and TV within 250 ms on a normal home network
- [ ] Open, PIN and Approval reclaim modes all work; a lost token costs about one second to recover in Open mode
- [ ] Takeover moves control and drops the old device to the picker
- [ ] Switch character, the 5-second undo and DM release all work and never change creature data
- [ ] Simultaneous DM damage and player healing both apply

**Phase 3: movement and multiple tokens**

- [ ] Players drag their tokens; locks, DM priority and lock expiry behave as specified
- [ ] Placement into unseen areas is rejected
- [ ] Lock movement works globally and per creature
- [ ] Linked companions are claimed and released with their parent; Give to… hands any creature to a device
- [ ] On phones, dragging a token, panning and pinch-zooming never conflict, and dragging works one-handed

**Phase 4: player spawning**

- [ ] Players create presets and spawn ×N numbered summons next to the parent
- [ ] Initiative modes, round durations, concentration prompts and end-of-encounter cleanup work
- [ ] Spawning modes and the summon cap are enforced; the console shows each summon's source

Every phase passes these on macOS as well as Windows (decision 10).

**Test setup:** the DM's Windows laptop, then a Mac running Trifold for the same run, plus an iPhone (Safari), an Android phone (Chrome) and a laptop joining by typed URL. Campaign: The Lantern at Greyford, with PCs Brannoc Hale and Wren Ashby flagged player-controllable, Tobin Marsh placed as an ally token (an NPC that can be claimed), and Gorm Tallow as an enemy token (must never be offered).

## Hard rules

- No accounts, cloud services, relays, telemetry or third-party hosting.
- The server is off until the DM starts it, and listens only on the private LAN.
- Never send a client data it is not allowed to see.
- Store only token hashes on the DM side; compare them in constant time.
- Validate every intent on the server: ownership of the creature, allowed field, value ranges, current locks and settings.
- Releasing, reclaiming or disconnecting never changes creature data.

## Approach

- Keep networking behind an interface (for example a `TableServer` with `ClientSession`s) so claim, lock and spawn logic can be unit-tested without real sockets; the pure logic belongs in `packages/rules` or a new package, per the repo's rule that logic lives in `packages/*`.
- Tests for the reclaim modes, takeover, lock expiry, stale-version rejection, delta merging and fog filtering.
- Rate-limit PIN attempts per device.
- Log server start and stop, claims, takeovers and rejected intents through Trifold's existing log (`apps/desktop/src/main/log.ts`, written to `Library/logs/`).
