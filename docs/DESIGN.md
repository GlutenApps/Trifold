# Trifold design

What Trifold is, how it is built, and why it works the way it does. A feature that is planned but not built is marked **(not built)**; §10 lists what is planned. File formats and parsing rules are in [DATA-FORMATS.md](DATA-FORMATS.md).

---

## 1. What Trifold is

Trifold is a local desktop app for Windows and macOS for a Dungeon Master running 5e campaigns and one-shots at a physical table, with the 2024 rules as its native edition. It covers the DM's compendium, campaign notes and combat tracker, reads the files of Lion's Den's *Game Master 5th Edition* and *Fight Club 5th Edition* apps, and adds a presenter for a second screen and a music player.

The app is a **DM console**. Players build characters wherever they like (another app or paper) and hand the DM a few numbers. At the table they can, if the DM allows it, open a page on their phones to run their own character (§1.1, item 7).

### 1.1 The parts

1. **Compendium**: bundled SRD content (2024 and 2014), the DM's own imported XML files and homebrew; browse, search, editors for every kind, the SRD rules text.
2. **Campaign**: party, NPCs, companions, a tree of notes, and a session log.
3. **Encounters and combat tracker**: initiative, HP, conditions, stat-block rolls, 2024 encounter budgets, fights that carry HP over.
4. **Presenter**: a second window on a TV or monitor showing scenes (title cards, images, maps with grid, tokens and fog of war), driven from the console.
5. **Music**: a local-file player with crossfades and scene-linked playlists, or the DM's phone played through the computer.
6. **Dice and table tools**: a roller with a log and pinned rolls, counters, timers, quick notes.
7. **Player connector**: a page the DM's Trifold serves on the local network, where players claim a character and update its HP, conditions, initiative and position from their phones. Off until the DM starts it.

### 1.2 Non-goals

- No character builder or player-facing character sheets.
- No accounts, no cloud backend, no sync between users, no hosted web client. The player connector's page is served by the DM's own Trifold, on the private local network only, while the DM has it on (ADR 0043). The app never phones home. It goes to the network only when the DM asks: web tabs (pages the DM typed the address of), the opt-in update check, and the player connector.
- No virtual tabletop features beyond §6.5: no dynamic lighting, no line-of-sight.
- No bundled non-SRD content, ever, and no links to community repositories in the app.
- No map making. Maps are images the DM supplies.

### 1.3 Where it stands

Trifold is in alpha: unsigned builds for Windows and macOS, for a small group of testers. §10 lists what is in the app and what comes next.

---

## 2. Decisions

Each design choice that refines or departs from this document has a short record in [`adr/`](adr/README.md): the context, the decision and its consequences. [adr/README.md](adr/README.md) indexes them and keeps the decision log, the history of how the design got here. This document describes the result.

---

## 3. Users and workflows

There is one user: the DM, on one Windows or macOS computer with a second display (TV or monitor) at the table. Players may join from their phones (§1.1).

**Prep (days before):** import content, build the campaign (notes, NPCs), enter PC cards from what players sent, build encounters from the compendium, build the scene tree (title cards, maps with grid alignment, pre-placed creatures, fog), tag music, build playlists and link them to scenes.

**At the table:** open the campaign, open the player window on the TV (blacked out), send scenes as the party moves, click the map to drop the party on it, start combat from the scene, run initiative, roll attacks and saves from stat blocks, apply damage, track conditions. Music crossfades with scene changes. End combat, and HP carries over to the next fight.

**After:** notes, encounter results and the session log stay in the campaign folder. The Library folder can be zipped, copied, or kept in a folder a sync app looks after, for use on another machine.

---

## 4. Architecture

### 4.1 Shell and UI

- **Electron**, packaged with electron-builder as an NSIS installer plus a portable exe on Windows and a dmg plus zip on macOS (ADR 0006). Builds are not code-signed, so the README explains the SmartScreen and Gatekeeper prompts (§10 has the signing plan). `electron` and `better-sqlite3` are pinned together to versions with prebuilt binaries, so installing needs no compiler (ADR 0001).
- **Renderer:** React 18 + TypeScript + Vite. State in Zustand stores. Zod schemas in `packages/schema` validate every stored object, in main and renderer alike.
- **Main process** owns the Library (all file I/O, through one `LibraryStore`), the SQLite index, window management (console and player window), display enumeration, backups, the update check, phone audio and the table server.
- **Two windows:** `console` (the DM) and `player` (the presenter). Both load the same bundle, routed by URL hash (`#/console`, `#/player`). The player window is frameless and opens fullscreen on the chosen display.
- **State flow for the presenter:** the console holds the authoritative presenter state (live scene, camera, tokens, overlays). Changes go to main by IPC and main re-broadcasts them to the player window. The player window is a pure view and never changes state. Target: a token drag reaches the player window within one frame at 60 fps.
- **Table server** (§1.1, item 7): an HTTP and WebSocket server in main (`src/main/table/`), started by the DM, listening only on private LAN addresses and answering to `trifold.local` by mDNS. The console pushes a snapshot of the table; each phone gets only its own view of it (`packages/rules/src/table`), never the original map image or hidden tokens. What a phone asks for comes back to the console as an intent, and the console applies it, so the console stays the one authority. The phone client is a separate small React app in `src/web/`. Devices and claims are kept in the campaign's `players.json`. Details: [PLAYER-CONNECTOR.md](PLAYER-CONNECTOR.md).
- **Audio** runs in the console renderer through the Web Audio API: one `AudioContext`, one `GainNode` per layer and per track. Output device selection uses `AudioContext.setSinkId`; see §6.6.

### 4.2 The Library (files-first)

All user data lives in one folder the DM picks on first run (default `Documents/Trifold Library`): human-readable JSON with a `schemaVersion` on every file, and media beside it. Older files are brought forward by the migrations in `packages/schema/migrations`. SQLite (`index.sqlite`) is derived from the files and can be deleted at any time; the app brings it back in line on open, re-reading any source whose hash or enabled flag differs from the index.

```
Trifold Library/
  library.json                 settings, layouts, web tabs, schemaVersion, last-open campaign
  index.sqlite                 derived; safe to delete
  sources/                     imported compendium sources (one folder each)
    <sourceId>/
      source.json              name, kind, file hash, enabled, campaigns, edition rules, license flags
      original.xml             the imported file, untouched
      records.jsonl            normalized records, one JSON object per line
  homebrew/
    <recordId>.json            the DM's own records (based-on provenance inside)
  art/
    <kind>/<key>.png           creature art, by normalized name, shared by every campaign (§6.8)
  campaigns/
    <campaignSlug>/
      campaign.json
      adventures/<id>.json     kept for imported campaigns; the UI uses note folders
      notes/<id>.json          notes and folders, markdown body inside
      npcs/<id>.json
      pcs/<id>.json            PC cards
      encounters/<id>.json     with any fight in progress and past results
      scenes/<id>.json
      counters/<id>.json       the Counters tool's counters
      timers/<id>.json         the Timers tool's timer definitions
      pinnedRolls/<id>.json    rolls pinned from the roll log
      sessions/<id>.json       the session log
      creatures/<id>.json      the campaign's own creatures, its own compendium source
      images/                  scene images (copied in) and display-size versions
      tokens/                  one token's art, and PC and NPC portraits
      players.json             player connector devices and claims
  templates/
    notes/<id>.json            note templates, shared by every campaign
  music/
    library.json               scanned folders, per-track tags, gain and loop trims
    playlists/<id>.json
  backups/
    <date>.zip                 daily rolling backups
  logs/                        main-process logs
```

Rules:

- Every write is atomic: write a temp file, fsync, rename. A JSON file is never partly written. Only `LibraryStore` in the main process writes to the Library.
- Nothing is stored only in SQLite.
- Music files are referenced where they are and never moved, renamed or copied. Scene images are **copied** into the campaign folder so a campaign is portable.
- Backups zip everything except `backups/`, `logs/` and the index. Music files are outside the Library and are not in them.
- Bundled SRD content is **not** in the Library. It ships inside the app package and is indexed beside Library sources as `srd-2024` and `srd-2014`.
- Several Libraries can exist; one is open at a time, switched in the Library's Settings. App-level state that belongs to the computer (which Library is open, recent Libraries, window position, the audio source and remembered phones, the second backup folder, the update check's state) is in `config.json` in the app's user-data folder. Before a Library is open, logs go to that folder too.

### 4.3 The index

SQLite through `better-sqlite3`, in the main process. Tables mirror the record kinds with the columns lists and filters need; an FTS5 table indexes names and text for search. The full record JSON is stored as a column, so lists never read from disk. Budgets: a search over 5,000 monsters returns in under 50 ms, and a cold rebuild from a 30 MB XML source takes under 10 s.

### 4.4 Boundaries

The renderer talks to main through one typed API, `window.trifold.*`, generated from a single TypeScript interface in `packages/api`. The renderer never touches `fs`, SQLite or Electron directly. All parsing and rules math are pure, tested functions in `packages/*` (`schema`, `rules`, `importers`), so the console, the main process and the phone client share them. The table server sits behind the same seam: it reads the state the console pushes, and the views it serves come from `packages/rules`.

---

## 5. Data model

IDs are ULIDs. Every stored object has `id`, `schemaVersion`, `createdAt` and `updatedAt`; dates are ISO 8601 UTC strings. The Zod schemas in `packages/schema/src` are the authority; the shapes below are summaries.

### 5.1 Compendium

**Source**: `{ id, name, kind: "srd"|"xml"|"open5e"|"homebrew"|"campaign", filePath?, fileHash?, enabled, campaignIds? (null means every campaign), defaultEdition, edition2024Books, license: { spdx?, attribution?, nonSrd }, importedAt, importerVersion, recordCounts, warnings }`

A `campaign` source is one campaign's own creatures, shown only while that campaign is open.

**Record** (one per compendium entry; the shape of `data` depends on `kind`):
`{ id, kind: "monster"|"spell"|"item"|"feat"|"species"|"background"|"class"|"condition"|"rule", key, name, displayName, sourceId, sourceBook?, sourcePage?, edition: "2024"|"2014"|"unknown", tags, basedOn?: { recordId, sourceId }, data }`

- `key` is the normalized name (`normalizeKey`: lowercase, edition tags and punctuation stripped, spaces collapsed). It is used for cross-references, duplicate detection, art and export.
- `edition` comes from the `[5.5e]` name suffix, the source's list of 2024 books, or the source's default (§7.1, `DATA-FORMATS.md` §2.10).
- Records with the same `key` collapse into one list row with a version switch (§7.2).

**Monster.data** (normalized from XML; unknown elements kept in `extra`):
`{ size, type, subtype?, alignment, ac: { value, note? }, hp: { average, formula? }, speeds: { walk?, fly?, swim?, climb?, burrow?, hover?, notes, raw }, abilities, saves, skills, proficiencyBonus?, initiativeBonus?, senses, passivePerception?, languages, cr, xp, scaled?: { fromCr, toCr }, damageVulnerabilities, damageResistances, damageImmunities, conditionImmunities, environment, isNpc, ancestry?, sortName?, description?, traits, actions, bonusActions, reactions, legendary: { perTurn?, header?, actions }, lair, spellcasting?: { spells, slots? }, extra }`

**Feature**: `{ name, displayName, text, uses?: { count, per: "day"|"turn"|"shortRest"|"longRest"|"rest" }, recharge?: { min, max: 6 }, cost?, tags, attacks: Attack[], rolls: RollButton[], saves: SaveCall[] }`
`Attack`: `{ label, toHit?, damage?, damageType?, reach?, range?, extraDamage: { damage, damageType? }[] }` (from the XML attack triple plus text parsing; no `toHit` means damage only)
`SaveCall`: `{ ability, dc, halfOnSuccess? }` (from text parsing)
`RollButton`: `{ label, dice }` (an attack triple that is not an attack, such as a heal)

Spell, item, feat, species, background, class, condition and rule records keep their source fields as typed properties (see `DATA-FORMATS.md` §2) plus `text`. Items add `{ typeCode, rarity?, requiresAttunement?, magic, modifiers }`.

### 5.2 Campaign

**Campaign**: `{ id, name, slug, preferredEdition, allowLegacy, enabledSourceIds (unused; sources say which campaigns see them), settings: { playerOverlays: { sceneTitle, initiativeStrip, pcHealthBars, roundCounter }, tokenStyle: "engraved"|"flat"|"twoTone"|"plain", hpDisplayMode: "hidden"|"bloodied"|"exact", summonable: { ref, name, type, size, ac, hp }[] }, activeAdventureId? }`

`summonable` is the campaign's companion list: the creatures players may bring into play from their phones.

**Adventure**: `{ id, name, summary, sceneIds, encounterIds, noteIds, order }`. Read from imported campaign files; an imported adventure's notes land in a folder named after it, and the UI uses folders.

**Note**: `{ id, kind: "note"|"folder", title, body (markdown), tags, links, parentId, order, role?: "quickNotes", capture?: { at } }`. Notes form a tree like scenes: `parentId` is the folder, `order` the place among siblings. `role` marks the Quick Notes folder; `capture` is set on a note taken with Quick notes.

**NPC**: `{ id, name, recordRef? (stat block), portrait?, role, location, notes, isAlive, hp?: { current, max, temp }, conditions?, playerControllable?, companionOf? }`. `hp` is what the last fight left. `playerControllable` lets players claim it; `companionOf` names the PC it is a companion of.

**PCCard**: `{ id, name, playerName, classText, level, maxHp, currentHp?, tempHp?, conditions?, ac, initiativeBonus, speed, passives: { perception, insight, investigation }, spellSaveDc?, saves, portrait?, dndBeyondUrl?, notes, tokenStyleOverride?, playerControllable? }`. No `currentHp` means full HP; current and temp HP carry between fights. A PC can be claimed unless `playerControllable` is false.

**CampaignCounter**: `{ id, name, initial, value, min?, max?, step (default 1), altStep?, showOnTv?, order }`. Whole numbers; `min ≤ max`, and `value` is held inside the bounds. Not the combatant `Counter`, which lives inside a fight.

**CampaignTimer**: `{ id, name, durationSec (1 s to a day), chime (default true), showOnTv?, order }`. A definition only: whether it is running belongs to the console and is never stored.

**PinnedRoll**: `{ id, name, label, expression, total, faces, kind, source: "pool"|"tracker"|"compendium", actor?, outcome?: "crit"|"fumble", rolledAt }`. A roll kept from the roll log until unpinned.

**Session**: `{ id, title, recap (markdown), events, startedAt, lastActivityAt }`. Each event is a `fight` (`encounterId, name, xp, rounds, casualties, pcs`), a `scene` shown (`sceneId, title`) or an NPC `death` (`npcId, name`), with its time `at`.

**Encounter**: `{ id, name, sceneId?, combatants: CombatantTemplate[], notes, state: CombatState | null, results: EncounterResult[] }`
`CombatantTemplate`: `{ id, ref: EntityRef, label?, quantity, role: "ally"|"enemy"|"neutral", hpOverride?, hidden, tokenId?, tokenIds?, cache?: { xp, cr, type, hp, ac } }`
`CombatState`: `{ round, turnIndex, combatants: Combatant[], log: LogEntry[], lairInitiative?, startedAt }`. Saved on every change; null between fights.
`Combatant`: `{ id, templateId?, name, maskedName, revealed, ref, role, initiative, initiativeBonus, dexterity, hp: { current, max, temp }, ac?, saves, damage and condition immunities, resistances and vulnerabilities, conditions: ConditionInstance[], concentrating, counters: Counter[], recharges, deathSaves, dead, hidden, held, isLair, tokenId?, recordId? }`
`EncounterResult`: `{ endedAt, rounds, xpEarned, casualties, log }`

**Scene**: `{ id, kind: "folder"|"title"|"image"|"map"|"blankGrid", title, subtitle, showTitleOverride: boolean|null, parentId, order, notes, image?: { path, displayPath, width, height }, backgrounds?: { id, name, image }[], activeBackgroundId?, backdrop?: "parchment"|"stone"|"dark", grid?: { cellPx, offsetX, offsetY, color, opacity, showToPlayers }, blank?: { cols, rows }, tokens: Token[], entryMarkers (unused), audio?: { playlistId?, trackId?, loop?, ambienceIds (unused) }, encounterId?, fog?: { enabled, shapes }, playerCamera: { mode: "fitMap"|"fitTokens"|"follow"|"manual", x, y, zoom } }`

`backgrounds` are art variants of one map (day and night, say) that share its grid and tokens. Fog shapes are rectangles, polygons or the whole map, each revealing or hiding, applied in order, in map pixels.

**Token**: `{ id, kind: "pc"|"creature"|"marker", ref: EntityRef, label, x, y (grid units, fractional allowed), footprint: 1|2|3|4, role, hidden, nameMasked, maskedLabel?, art?, glyph?, color?, dead, summon? }`. `summon` marks a creature a player brought into play, with its owner, HP, AC and how long it stays.

**PlayersFile** (`players.json`): `{ devices: { deviceId, tokenHash, label, lastSeen }[], claims: { creatureKind, creatureId, deviceId, claimedAt, pinHash? }[], reclaimMode: "open"|"pin"|"approval", movement: { all, creatures }, summoning: { mode: "on"|"approval"|"off", cap } }`. Written only by main. Only hashes of device tokens and PINs are kept.

### 5.3 Music

**Track**: `{ id, path, sizeBytes?, title, artist?, album?, durationSec, gainDb (null until measured), tags, loop?: { startSec, endSec }, kind: "music"|"ambience"|"sfx", addedAt }`
**Playlist**: `{ id, name, trackIds, shuffle, loop, crossfadeSec? }`

### 5.4 Cross-references

`RecordRef = { recordId, sourceId, key, edition }`. Encounters, tokens and NPCs store the full ref, so a re-imported source can be relinked by `key` if IDs change. Combatants and tokens point at what they are through an `EntityRef`: a PC card, a record, an NPC, or a custom name, each with its name cached. When a referenced record is missing (its source disabled or deleted), the UI shows the cached name with a warning and never crashes.

---

## 6. Module specifications

### 6.1 Compendium and sources

**Bundled SRD.** A build script (`scripts/fetch-open5e.ts`) pulls the SRD 5.2.1 and SRD 5.1 documents from Open5e's v2 API, normalizes them into Trifold records, and writes `resources/srd-2024.jsonl` and `resources/srd-2014.jsonl` into the app package. `resources/srd-manifest.json` records the pinned document keys (`srd-2024`, `srd-2014`), counts, fetch date and license texts. Optional open third-party documents would come in the same way, opt-in **(not built)**.

**XML import.** Library › Compendium › Sources has the import. It accepts Lion's Den compendium XML (`<compendium>`), Game Master campaign XML (`<campaign>`), and Fight Club GM exports (a `<campaign>` holding one `<pc>`). Import runs in the main process and streams the file, so a 30 MB file never blocks the UI. It writes `original.xml` and `records.jsonl`, then indexes. Importing the same file again (by hash) changes nothing; importing a changed file compares by `key` and reports added, changed and removed counts. Sources can be enabled, disabled and deleted.

**Per-campaign sources.** An imported file shows in every campaign or only in the campaigns ticked on its row (`Source.campaignIds`). The stat blocks a campaign file brings in start as that campaign's only. With a campaign open, the compendium, the builder and search answer only from the sources it sees; in the Library, every enabled source shows.

**Lenient parsing.** Unknown elements are kept in `data.extra`. A missing field never fails an import; it becomes a warning listed on the source's row. Names match case-insensitively for cross-references. `DATA-FORMATS.md` documents every field and convention.

**Browse and search.** One list per kind, as sub-tabs in table-time order: Monsters, Spells, Conditions, Rules, Items, Classes, Feats, Species, Backgrounds. Those that do not fit fold into a More menu. Each list has a filter bar: text search (FTS), source, edition (2024, legacy or all), and for monsters CR range, type, size, environment and **Named** (stat blocks a book marks as a named character, `isNpc` on the record; the word NPC is kept for campaign characters). Monster rows show name, CR, type, size and badges for Named, source and edition. Detail panes render a stat block in the 2024 layout whatever its edition. Spell names in stat blocks and item text open the spell when an enabled source has it. A stat block's ability modifiers and saves, skills, initiative and hit dice are roll buttons, as are its attacks, damage and save calls; Shift-click rolls with advantage and Ctrl-click with disadvantage. A monster's page ends with **Used by**: the campaign NPCs in any campaign that use it as their stat block, each a link.

**Source priority.** Library › Compendium › Sources orders the sources. When several hold a record with the same key, its row shows the version from the highest one, one source pill and a + for the others (§7.2).

**Edition handling.** See §7.

**Attribution.** Settings › About lists every enabled source's license text, the exact SRD attribution statements and the game-icons author credits.

### 6.2 Homebrew and duplication

- **One Edit**, wherever the record is: a compendium record's page, a creature's row in the encounter builder, a creature in the tracker. It opens that kind's editor in the same panel: on the DM's own record as it is, on any other as a copy not yet written (records from the SRD or an imported file never change). Library › Compendium › **New homebrew** opens an editor on a blank record or on a copy of one found by name.
- **Save asks, inline**, in the editor's pinned header (never a modal), showing only the choices that apply. **Confirm** writes; **Back** returns to the form.
  - **Name**: a record in the Library's compendium must not share a name with one already there, since records with one name share a row. The step names the record that has it and offers the next free name.
  - **Where it lives**: *This campaign only* (the default; a campaign creature) or *All campaigns* (Library homebrew). For the DM's own record: *Update it* or *Save as new*.
  - **Where to use it**, narrowest first: from a fighter, *Just Goblin 2* (it leaves its group as a row of its own) or *Every Goblin in this fight*; from a builder row, *This row* or *Every Goblin in this encounter*; from a record page, *Nowhere yet*; and *Every Goblin in this campaign* when other encounters, fights or maps use it. The row or fighter where Edit is pressed takes the creature's name and drops its HP override. The wider choices work through Replace references (below).
- **Campaign creatures**: a campaign's own records in `campaigns/<slug>/creatures/`, one compendium source per campaign, listed only while that campaign is open with **This campaign** as their source pill, and never sharing a row with a Library record. **Use in all campaigns** copies one into Library homebrew under its own name. They travel with campaign export; importing a campaign as a copy gives them new ids.
- Copies carry `basedOn` provenance.
- **Monster editor**: every field in §5.1. Ability scores with their modifiers, saves and skills as proficiency toggles or numbers, AC with a note, HP with its formula (and "roll average from formula"), speeds, senses, languages, CR with proficiency bonus and XP filled in, damage and condition lists as chips, and feature lists for traits, actions, bonus actions, reactions, legendary and lair actions with uses, recharge, attack triples and save calls.
- **CR scaler** (ADR 0038): **Scale to another CR**, at the top of the monster editor's Challenge section, with − and + to step one CR and a list to jump. Each number moves by how much a typical monster's does between the two CRs (a fit to the SRD 5.2 monsters), so the monster keeps its shape: AC, attack bonuses and save DCs by the difference; HP and damage by the ratio, with the same dice sizes; saving throws and skills with the proficiency bonus. The Multiattack moves to a typical count for the new CR (1 below CR 3, 2 to CR 10, 3 above), each attack its own roll with its share of the target's damage per round; going below CR 10 drops legendary actions, and going past it adds legendary actions (Strike, Shift; Legendary Resistance from CR 16) and an area attack, all within the same damage budget (ADR 0051). Every change shows as old → new with a checkbox, all ticked, and the CR follows what is ticked: each part lands at the target or stays, blended by weight (HP and damage per round 35% each, AC 15%, attack bonus and save DC 7.5% each), so leaving any out lowers the CR (ADR 0048); **Tune** gives each part its own CR stepper, attacks per turn and the extras, shows the CR they add up to, and **Balance** brings it back to the chosen CR by moving hit points (or damage) (ADR 0051). **Apply to the form** changes only the form. The name stays; `scaled: { fromCr, toCr }` shows as a **Scaled CR 1 → 5** tag on the stat block.
- **Other editors**: item, spell, feat, species, background, condition and class editors are forms in titled sections with the XML's field names; classes are built level by level (features, ability score improvements, spell slots). Rules are read-only. Subclasses have no editor **(not built)**.
- **Encounter-level tweaks**: a row's label and HP override live on the encounter. A compendium creature's row has Edit (above), with the label as the copy's name and the HP override as its HP.
- **Replace references**: the page of the DM's own copy (homebrew or a campaign creature) offers **Replace <original> in this campaign…** and, while the campaign uses the copy, **Put <original> back in this campaign…**, so a wide choice at Save can always be undone. Each confirms inline with what it would change ("Use Grik in place of Goblin in 3 encounters (5 rows), 1 fight and 4 tokens?"), then switches every encounter row that uses it, the running and paused fights of those encounters (HP, conditions and turn order kept) and map tokens. Rows keep their labels and HP overrides; campaign NPCs keep their stat block. A reference matches by record id, or by key in the same source after a re-import.
- **Duplicate** is on encounters, scenes (with or without their subtree), NPCs, PC cards and playlists too.
- **XML export** of homebrew or any source, in the Lion's Den format so the files work in the other apps **(not built; see `DATA-FORMATS.md` §2.15)**. Records whose `basedOn` source is flagged `nonSrd` will show a warning before writing.

### 6.3 Campaign management

- The Library's Campaigns page lists campaigns; one is open at a time. The Campaign tab has five sub-tabs: **Party**, **NPCs**, **Companions**, **Notes** and **Sessions**.
- **Notes** are a tree of folders beside the open note (ADR 0010): find in notes (a phrase, with snippets that open the note at that hit), new note (blank or from a template), new folder, collapse, and drag to reorder or into a folder. The open note is formatted text, stored as markdown, and saves itself as it is edited. A narrow panel shows the list or the note, not both. Global search finds every note that names something (§6.9).
- **NPCs** can wrap a stat block (any monster record) and carry a portrait, role, location and notes. A named NPC carries HP and whether it lives from fight to fight. Any creature in an encounter or a running fight can become one with **Track as NPC**, and the NPCs tab shows carried HP with Restore (ADR 0012).
- **PC and NPC forms** use the homebrew editors' titled sections, shown in place of the tab's list. A short **Required** section comes first: Name, Max HP and AC for a PC (empty until typed; Save waits for all three), Name for an NPC. The rest are **Optional** sections, folded on a new card and open on edit when they hold something: for a PC *Basics* (player, class, level, initiative bonus, speed), *Senses* (passive Perception, Insight, Investigation), *Combat* (spell save DC, saving throws, and current and temp HP when editing) and *Notes*; for an NPC *Basics* (role, location, alive), *Stat block* (a compendium creature, found by name) and *Notes*. A new form has **Save and add another**, the quick way to enter a party. Every row has Edit and Delete.
- **Adding** (ADR 0037): the Party and NPCs tabs each have one plus, **Add PC** and **Add NPC**, with the same menu: **Start blank**, **Import from another campaign…**, and on NPCs **Copy from the compendium…** (optionally named characters only). A compendium creature becomes a named NPC with its own copy of the stat block in this campaign's creatures, so it can change without touching the original. Each NPC row shows where its stat block lives (*This campaign*, *Homebrew*, or the book or file).
- **Import from another campaign…** lists the PCs or NPCs of every other campaign in the Library, searchable by name or campaign, and copies the one picked with a new id and full HP (an NPC also comes back alive), its notes, stat block link and portrait. When this campaign cannot see the stat block's source, the stat block comes along into this campaign's creatures.
- **Editing an NPC** (ADR 0039): the pencil opens one form, the NPC first and its stat block's sections below, CR scaler included. One Save writes a changed stat block: in place when only this NPC uses it here, else as a copy in this campaign with the NPC relinked. Carried HP keeps its share of damage and encounter rows take the new numbers.
- **Deleting an NPC** says where it is used, takes it out of those encounters, fights and maps, and deletes a stat block that only this campaign had.
- **PC cards** carry current HP, which a fight starts from and writes back when it ends; **Long rest** on the Party tab heals everyone and lowers Exhaustion a level (ADR 0012). PC cards and NPCs also carry conditions between fights, set from their rows or a player's phone, into and out of fights like HP, durations dropped (ADR 0049). Import from a Fight Club GM export fills what the stat block provides (AC, HP, saves, skills, passives, spells). Importing a player's exported PDF character sheet, read locally, is **(not built)**.
- **Companions**: the creatures players may bring into play from their phones, summons included. The tab lists them; a creature's compendium page has **Available as a companion**, and the tab has **New companion**. An NPC can also be the **Companion of** a PC, claimed and released with it.
- **Session log** (ADR 0040): the first fight that ends, scene that goes on the TV or NPC that dies opens a session, which fills itself with the fights (XP, XP per PC, rounds, casualties), the scenes shown and the NPCs who died. The DM adds a title and a recap in the notes editor. A session takes events until play has stopped for six hours, so a game past midnight stays one session; **New session** starts one by hand. The Sessions tab lists them newest first under the campaign's XP so far. Each encounter also keeps its own results (XP, rounds, casualties, the fight's log).
- **Quick notes** (ADR 0018): a dock tool, also `Ctrl+N` from anywhere in the console, with a title (required), the notes editor and Save (`Ctrl+S` inside the form; Escape drops the draft). Save files the note in the Quick Notes folder (made at the end of the root when missing, found by `role: quickNotes`) with `capture.at`, and focus returns where the DM was. Below the form, every note in that folder, newest first, with find; one opens with the note pane's tools plus Move to and Open in Notes. A note moved out of the folder is an ordinary note. In-game timestamps are **(not built)**.
- **Counters** (ADR 0019): a dock tool, also `Ctrl+Alt+C`, of the campaign's counters in the DM's order. A new counter takes a name, an initial value (0), optional minimum and maximum, a primary step (1) and an optional alternate step. Each counter has −primary and +primary around its value, and −alternate and +alternate outside those when it has an alternate step; clicking the value types one. Show on TV, reset, edit and delete (inline confirm) are its row actions; its range, when it has bounds, sits under the buttons; rows drag to reorder. With focus in a counter, ↑ and ↓ change it by the primary step, Shift+↑/↓ and PageUp/PageDown by the alternate step (else the primary), and Home and End go to a bound. The mouse wheel never changes a counter. Values are clamped to the bounds; a counter at one shows it, and a change that runs into one flashes. Up to three counters marked Show on TV appear in the player window's bottom-left corner ("Name value / max"), hidden as a group by the Counters switch in the TV tab's overlays.
- **Timers** (ADR 0021): a dock tool, also `Ctrl+Alt+T`, of named countdowns in the DM's order. A new timer takes a name, a duration (typed as `90`, `1:30`, `2m` or `1m 30s`, or a 30s, 1m or 5m preset) and Chime at zero. Each timer shows its time left and one main button (Start, Pause, Resume, Start again); chime, show on TV, reset, edit and delete (inline confirm) are its row actions; rows drag to reorder; any number run at once. A run is kept as its end time (or the time left while paused), so it never drifts. Runs are not stored, and every timer is idle after a restart. At zero the row turns red, pulses and says Time's up, the Timers dock icon shows an alert pip, and a chiming timer plays a short tone on the effects layer without touching the music. One timer at a time can be on the TV, large, above the counters in the bottom-left corner.

### 6.4 Encounters and combat tracker

One **Encounters** tab holds the list and the builder; while a fight is loaded, the combat tracker takes its place. **Back** pauses the fight, and any number of fights can wait in progress, for a split party (ADR 0022).

**Encounter builder.** Add PCs (all or some) and creatures from the compendium. Quantity, label, role and hidden flag per row. Creatures of the same name are numbered across the encounter (Goblin 1, Goblin 2), and the numbers follow them onto tokens and into the tracker. Difficulty uses the **2024 XP budget** (§7.4): creature XP is summed (no multiplier) and set against the party's Low, Moderate and High budgets. One row at the top of the builder shows the band, XP per PC and a meter against the budgets. **Scale** there gives each compendium creature a CR picker; the band follows the picks, and Apply saves same-named scaled copies to the campaign. An **encounter assistant** that suggests a group for a budget is **(not built)**.

**Starting combat.** Every creature rolls its own initiative, and a horde one for all its members (ADR 0047). PCs prompt for their rolled initiative or roll from the card's bonus; a player connected from a phone gets a box for it instead. Surprise gives a combatant disadvantage on its initiative roll. A "Lair" entry joins at initiative 20 when any combatant has lair actions. Ties go to Dexterity, then to the DM's drag. The fight is whoever is here (ADR 0044): from a map, the party on it plus any PCs the encounter names; from the Encounters tab, the PCs it names; the whole party when that would leave nobody.

**Adding mid-fight.** **Add to fight** (`A`) opens a panel with the party members and named NPCs not yet in the fight as one-tap buttons, and a creature search with a quantity. Newcomers join in initiative order, are numbered after any of the same name already there, are kept on the encounter, and tie themselves to a waiting token on the map in play.

**Turn loop.** The active combatant is highlighted; Next and Previous; a round counter. At the start of a turn the tracker rolls recharge for `recharge` abilities (d6 ≥ min), resets the legendary action pool and ends conditions that last until the start of that turn; at the end of a turn it prompts for "save at end of turn" conditions. Delay and ready are a drag in the order.

**Stat block panel.** The active combatant's full stat block, with buttons:

- **Attack**: rolls to-hit (advantage and disadvantage, crit detection) and damage (doubling dice on a crit) from the attack triple; no to-hit means damage only.
- **Multiattack**: rolls every attack the Multiattack text names, in one click.
- **Save call**: from parsed save calls. Pick targets; creatures roll with their save bonus, and each PC's bonus from the card is shown so the DM can read results off; half or none on a success.
- **Spell**: a spell name opens its record; a slot tracker for creatures with `slots`.
- **Ability, save, skill, initiative and hit dice** rolls, as in the compendium, into the fight's log.
- **Counters**: legendary actions per turn, Legendary Resistance, N/day uses, custom counters.

**Carrying over.** When a fight ends, each PC's current and temp HP go back to the card, and each named NPC keeps its HP and whether it lives; compendium creatures start fresh every time (ADR 0012). The active row's toolbar: hide from the players (strip and map together), mark dead, track as NPC, place on map, remove.

**Damage and healing.** Damage takes an optional type; the tracker halves for resistance, zeroes for immunity, doubles for vulnerability, and shows what it did. Temp HP absorbs first. A concentrating combatant that takes damage prompts a Constitution save (DC 10 or half the damage, whichever is higher). The massive damage rule shows as a hint. PCs at 0 HP switch to death saves (three successes or failures; a natural 20 regains 1 HP; a natural 1 counts as two failures). Creatures at 0 HP are marked dead and grayed on the map.

**Conditions.** The 2024 list (§7.3) plus tracker markers (Concentrating, Surprised, Hidden, Dead, custom). Each has an optional duration (rounds, until the start or end of a turn, until a save) and a source. Applying a condition a creature is immune to warns. Exhaustion has levels 1–6 with the 2024 effects shown. The condition lane opens the condition's rules text from the compendium.

**Player-facing display.** The initiative strip on the TV shows masked names (creature type and number, such as Humanoid 2, until revealed), portraits or tokens, the active turn and the round, on one row: it starts at the active turn and folds the rest into a **+N** chip. PC health bars are optional. Creature HP shows as the campaign's HP display mode: hidden, bloodied (a marker at half HP, the default) or exact.

**Log.** Every roll, damage, healing and condition change is logged with a timestamp and kept with the encounter's results.

### 6.5 Presenter

The presenter is two pieces: **Scenes**, the scene list in the dock, and the **VTT** tab (the TV tab) on the stage, which shows the selected scene and holds every control for the screen (ADR 0008). The live strip mirrors the one-tap actions and is never a control's only home.

**Windows.** Console plus player window. Settings picks the target display; the player window opens fullscreen there and remembers the choice. Blackout, take off TV and undo last scene are console hotkeys (`hotkeys.ts`), not OS-level shortcuts.

**Scene tree.** One tree per campaign; folders; drag to reorder or reparent; duplicate with or without the subtree. Hovering a scene shows its thumbnail. **Clicking a scene selects it and previews it on the TV tab; Enter, double-click or ▶ makes it the active scene.** `Alt+↓/↑/←/→` set the next, previous, parent or first child scene active; `Ctrl+Alt+↑/↓` select the previous or next scene on the TV tab without setting it. A Recent list shows the scenes set last. **Go live** (`Ctrl+Shift+P`) is the table's output switch: live, the active scene shows on the TV (opened on a second display, or the one chosen in Settings) and on phones; not live, the TV is closed, phones wait, and a scene set active waits for Go live (ADR 0046).

**Scene kinds.**

- *Title card:* text on a backdrop, optional subtitle, optional image.
- *Image:* a full-bleed illustration; no grid or tokens; the player camera fits the image.
- *Map:* image, grid and tokens. A map can hold several backgrounds (day and night, say) that share its grid and tokens.
- *Blank grid:* a generated backdrop (parchment, stone or dark) with a grid and tokens, for improvised combat.
- Any scene can have DM notes, linked music (a playlist or a single track) and a linked encounter.

**Images.** Import copies the file into `campaigns/<slug>/images/`, stores its size, and makes a display-size version (long edge ≤ 4096 px, JPEG, `<id>.display.jpg`) for the player window. PNG, JPG and WebP are supported.

**Grid.** Square cells, 5 ft each. Per-scene `cellPx`, `offsetX/Y`, color, opacity and `showToPlayers`. Alignment by typed numbers, or a two-click tool (click opposite corners of one cell) that works out the cell size and offset. Tokens snap to the grid; hold Alt to place freely. Hex grids are **(not built)**.

**Tokens.** PC tokens from cards, NPC tokens from the campaign's NPCs, creature tokens from the compendium or an encounter, and markers. The Add creature or marker pop-up lists the campaign's NPCs above the creature search: an NPC token is sized and masked from its stat block (one cell and "Creature" without one), starts neutral and dead when the NPC is, and like a PC has one token per map, so placing it again moves it. Footprint comes from size (T, S, M = 1; L = 2; H = 3; G = 4). Drag on the console; the TV follows within a frame. Per token: hidden (DM only), masked name (the TV shows creature type and number), HP display, condition icons, an active-turn ring and a dead marker. The right-click menu reveals, masks, marks dead, removes and sets art.

During a fight, on the map in play (the live map, else the encounter's map), a token tied to a combatant wears its turn-order number and follows the combatant's hidden and dead flags; the menu's hide and dead act on the combatant. An unlinked PC or creature token wears a plus that ties it to the one matching combatant, offers a choice of several, or adds it as a newcomer; the menu can link, add or unlink. Matching is by identity (same card, NPC, record or custom name), never by name alone (ADR 0012).

**Party placement.** When a map is live, the party is placed where the DM clicks on the map. The PC tokens land as a compact cluster around that point (a column two wide) and can be nudged. Nothing carries over between scenes; a map keeps its tokens where they were left.

**Cameras.** A DM camera (free pan and zoom, mouse wheel and drag) and a player camera controlled from the console: fit map, fit tokens, follow the active combatant, or manual pan and zoom. The console draws the player's viewport as a rectangle over the map. The target display's aspect ratio is respected; letterboxing uses the scene's backdrop color. The player camera ignores tokens that are hidden or under fog, so Fit tokens and Follow never point at what the players cannot see.

**Overlays on the TV.** Scene title (a campaign setting with a per-scene override), the initiative strip, PC health bars, round counter, counters and a timer (bottom-left), the break screen (a title and an optional countdown; music keeps playing), and blackout, a curtain over everything. Each overlay has its own switch on the TV tab. **Take off TV** (the live scene's stop button, the TV tab, the strip, `Ctrl+Shift+X`) ends the live scene and leaves the overlays up; it can be undone (ADR 0030). The player window can also show a handout over the live scene, which has no console control yet.

**Transitions.** Scene changes fade over 300 ms in the player window. A per-scene cut is **(not built)**.

**Combat integration.** **Start combat** on a map builds an encounter from the placed creature tokens and the party on the map, or opens the linked encounter with tokens matched by `tokenId` and adds the party on the map. **Place encounter…** drops a built encounter's creatures on the map, hidden from the players, and links it, so the DM can position them before starting (ADR 0005). During combat the active token is highlighted on both screens and a dead combatant's token grays.

**Fog of war.** A mask per scene, saved with it, made of shapes in map pixels: rectangles (snapped to grid cells when the scene has a grid) and polygons, each revealing or hiding, plus Reveal all and Hide all. The player window draws fog opaque; the console's map draws it as a light mist with dark hatching, which reads on dark and light maps alike. Tokens whose centre is under fog are never sent to the player window or to phones. **Fog of war** in the map toolbar (`F`) opens a bar under the map with **Fog on**, **Reveal** or **Hide**, **Rectangle** (drag; Alt draws freely) or **Polygon** (click the corners; the first corner, a double-click or Enter closes it), **Reveal all**, **Hide all** and **Undo** (`Ctrl+Z` while the bar is open; this session only). Right-drag pans while drawing. Only the DM changes fog. A freehand brush and soft edges are **(not built)**; line-of-sight reveal is a non-goal (§1.2).

**Movement ruler.** **Ruler** in the map toolbar (`R`) measures on a map or blank grid in squares and feet, from square centre to square centre, and keeps the reading until Escape or a new drag (a second Escape leaves the ruler); right-drag pans. Dragging any token shows how far it has moved from where the drag began. Every square is 5 ft, diagonals too. While the map is live the TV shows the same line and reading, except for a measurement that ends under fog or on a hidden token. A player's move from a phone shows its ruler on the DM's map and the TV too.

**Area shapes** (ADR 0050). **Area shapes** in the map toolbar (`S`): a cone, sphere, cube or line with its size in feet, the origin on a grid corner and a drag to aim it. The squares at least half inside are shaded (the 2024 grid variant); visual only, selecting nothing. The TV and phones show it while its map is live, under the fog, and not when its origin is under fog.

**Player connector.** **Player devices** in the VTT tab's TV tools opens the connector's pop-up. **Let players join** starts the table server (§4.1); **Show join code on TV** puts a QR code and the address on the TV. Players open the page in a browser (no install, no account) and claim a character: any PC card by default, and an NPC the DM marks **Players can claim this character** while it is not an enemy. A phone then shows what the TV shows (fog applied, only tokens the players may see) and its character's tools: HP, temp HP, max HP and AC, conditions during a fight, initiative when the fight waits on it, moving its token (the move waits for **Done**; a drop under fog or off the map is refused), and bringing in companions from the campaign's list, which join the fight on its side. The pop-up lists who is connected and as whom, releases a claim, sets how a dropped phone gets back in (open, a PIN, or the DM's approval), locks movement for everyone or one device, and gives an NPC to a player. The DM stays the authority. Full spec: [PLAYER-CONNECTOR.md](PLAYER-CONNECTOR.md).

### 6.6 Music

**Library.** Library › Music folders. A scan reads MP3, OGG, FLAC, WAV and M4A files recursively, with tags from `music-metadata`, and stores references (files are never copied or moved). A rescan relinks files that moved (`DATA-FORMATS.md` §5.5). Per track: kind, mood tags (free text with suggestions: combat, tension, tavern, travel, eerie, sad, triumphant, boss), gain and loop trim.

**Loudness normalization.** After a scan, each track's integrated loudness is measured with a pure-JS EBU R128 pass (`features/music/loudness.ts`) in the console, one track at a time in the background, and stored as `gainDb` to bring tracks to −16 LUFS. Tracks play at 0 dB until measured.

**Player.** One music player in one audio graph; master volume; panic mute (`Ctrl+Alt+M`). A playlist queue with play and pause, next and previous, shuffle and loop. **Every transition crossfades** on an equal-power curve over the configured time (default 4 s, 1–10 s), stop (a fade out) and start (a fade in) included. The next track is decoded ahead, so a crossfade starts on the keypress. The engine has ambience and effects layers too, which carry the timer chime; other ambience and effects come from the phone (below). Output device selection lists devices from `enumerateDevices` and remembers the choice.

**Phone audio** (ADR 0007). The Music tool's Phone tab makes this computer the phone's speaker, so whatever plays on the phone comes through the table speakers. On Windows 11 Trifold is the Bluetooth audio receiver itself, through the OS's AudioPlaybackConnection API driven by a bundled PowerShell helper (no native module): the tab lists the paired phones, the ones used before first, and one click on a phone brings up the Bluetooth link and the audio together, never automatically at launch. The helper keeps the connection open and reconnects when the phone wanders. Pairing a new phone is a button into Bluetooth settings. On macOS the tab is a two-step AirPlay Receiver guide with a button into the right settings pane. The OS sends the phone's audio to its default output, past Trifold's output choice and panic mute; the tab says so and points at the system sound settings.

An **Audio source** toggle at the top of the Music tool chooses "This computer" (Trifold's player) or "Phone". Phone pauses Trifold's player and makes its transport, hotkeys and scene links inert, and the live strip shows the phone's name, state and one Connect or Disconnect button in place of the player controls. The choice is remembered per computer.

**Scene linking.** A scene may link a playlist or a single track, with a **Loop** switch: a looping playlist repeats, one that does not plays through once and stops; a looping track repeats, one that does not plays once. A playlist starts with its own saved loop setting, and the scene's switch overrides it for that scene only, until the DM presses the loop button. When a scene with different music is sent, the music crossfades to it; the same music keeps playing and only takes the scene's loop. A scene set to "Keep current audio" leaves the music alone. Sound effects are not offered.

### 6.7 Dice and reference

- **Roller**: a dice pool built by clicking (each click on d4…d100 adds one; right-click takes one away), a modifier stepper, advantage or disadvantage for a lone d20, then Roll. One pool is shared app-wide: the Dice pop-up and the live strip's pool show and edit the same selection (ADR 0009). A typed expression (`2d6+3`, `4d6kh3`, `d20 adv`) is a second field. The roll log is shared with combat and the compendium and reads oldest first, with the newest roll and its reveal at the bottom; the reveal plays only for a fresh roll. Any roll can be pinned to the campaign under a name until it is unpinned (ADR 0031). Roll sounds are **(not built)**.
- **Rules** (ADR 0041): the SRD rules chapters as a Rules kind in the compendium, one record per rule with its section, per edition like conditions, the text rendered as markdown, searchable and reachable by deep link. SRD 5.1 gives 239 rules in 41 sections (actions, cover, movement, travel, spellcasting, traps…); SRD 5.2.1 gives its 58 play-chapter rules but not its Rules Glossary, which no source carries cleanly. Rules are read-only; custom pages are what notes are for.

### 6.8 Token art pipeline

- **Icons.** The build step `scripts/fetch-game-icons.ts` fetches the game-icons repository, copies the SVGs into `resources/icons/svg/`, refreshes `resources/icons/manifest.json`, and writes `resources/icons/credits.json` (the author list) for the About page.
- **Token renderer.** A glyph inside a disc. Treatments: **engraved** (parchment disc, dark glyph, brown ring; the default), **flat** (type-colored disc, white glyph, dark ring), **two-tone** (dark disc, type-colored glyph) and **plain** (disc and initials), with an ally or enemy ring color. The glyph is a CSS mask, so the treatment colors it; one component draws tokens on both screens.
- **Glyph selection** for creatures: custom art, then the `ancestry` table, then a name keyword table (species and humanoid roles), then a synonym table (undead and beast families), then the creature type's default. Item and spell tables (name keywords and type codes; spell schools) live in `resources/icons/mapping.json` beside the creature tables and have lookups in `packages/rules`, but only creature tokens are drawn. Unmatched names are logged so the tables can grow.
- **Creature art** (ADR 0033):
  - **Set art…** on a map token asks **This token** or **Every <name>**. This token copies the image into the campaign for that one token. Every copy saves the art for the creature: compendium creatures in the Library's `art/` folder, shared by every campaign; PCs and NPCs in their campaign's `tokens/` folder. It shows on every token of that creature, existing or placed later, and on its compendium page, PC card or NPC. A token's own art wins over its creature's, and custom art wins over generated tokens. Remove goes back to the generated token.
  - **Library › Images** lists everything that can be a token: compendium creatures (homebrew included) and every campaign's PCs and NPCs. Search, filters for **needs art**, type, source and campaign; add, replace or remove art per row. **Add from folder** matches files to rows by file name (case-insensitive, punctuation stripped, edition tags ignored) and lists matches and misses before applying. Items, spells and other kinds have no art.
  - **Size.** Every image added this way is shrunk to fit 512 × 512 and saved as PNG (transparency kept); the original is not kept, so backups stay small (about 150–400 KB an image).
  - Campaign export carries PC, NPC and token art from the campaign's `tokens/` folder, but not the Library's creature art **(not built)**.

### 6.9 Global search and deep links

- **Search box** in the middle of the console's top bar (`Ctrl+F`; a button under 960 px). Names and titles: notes and folders, NPCs, PCs (and player names), encounters (and their members' names, listed after name matches as "with …"), scenes (title and subtitle), compendium records of every enabled kind, and web tabs. Case-insensitive, with punctuation and apostrophes folded; ranked exact, prefix, start of a later word, anywhere; grouped in a fixed order with six rows per group and a count of the rest. Arrows move, Enter opens, Escape clears; results update on every keystroke. The campaign half ranks in memory (`rankByName` in `packages/rules`); the compendium half asks the index (`compendium.suggest`) after an 80 ms pause. From two characters on, a **Mentioned in** group finds the phrase in note bodies and in the notes on encounters, NPCs, PCs and scenes, one row per item with a snippet and a count; a note opens at that occurrence, an encounter with the phrase selected in its DM notes. A **Compendium text** group does the same for record text through the FTS index. A group with more rows than it shows has **Show all**, which lists that group alone until Back or Escape. Music is left out. In the Library the same field searches every campaign and opens the one a result is in.
- **Deep links.** `navigate({ type, id, anchor? })` (ADR 0017, [DEEP-LINKS.md](DEEP-LINKS.md)) opens a note (at a phrase), folder, NPC, PC, encounter (at a DM-notes phrase), scene, record or web tab: it brings the item's tab or tool forward, and the owning panel selects the item, scrolls to it and flashes it. A closed tab opens in the only group, else away from the VTT, then away from a running fight, else in the focused group; an open tab never moves.

---

## 7. Rules edition handling (2024 native)

### 7.1 Edition tagging

Each record has an `edition`. A `[5.5e]` suffix on the name means 2024; so does a source book on the source's list of 2024 books, which the DM ticks per imported file (ADR 0028). SRD 5.2.1 is 2024 and SRD 5.1 is 2014. Anything else takes the source's default edition (2014 for imported files unless changed).

### 7.2 Legacy content in a 2024 campaign

`allowLegacy` (on by default) shows 2014 records with a "legacy" badge. Conversions apply when a record is shown or used and are never written back:

- Monsters are used as they are. Initiative bonus is the Dex modifier when `init` is absent. Proficiency bonus comes from CR when the "Proficiency Bonus" trait is absent.
- Spell and feature text is shown unchanged; the tracker's parsers accept both 2014 and 2024 attack and save phrasing.
- Conditions follow the 2024 definitions (exhaustion levels, for one).
- Entries that repeat across editions and sources collapse to one list row with a version dropdown on the record. The row shows the record from the highest-priority source (§6.1), that source as one pill, and a + when other versions exist; the campaign's `preferredEdition` breaks a tie inside one source.

### 7.3 Conditions (2024)

Blinded, Charmed, Deafened, Exhaustion (levels 1–6: −2 × level to d20 tests, −5 ft × level to speed, death at 6), Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious. Tracker-only markers: Concentrating, Surprised (disadvantage on initiative), Hidden, Dead, and Bloodied (a display threshold at half HP or less).

Each condition's rules text is a compendium record (`kind: condition`, one per edition), fetched from the SRD documents at build time like every other kind. The Compendium tab lists them under Conditions, and the tracker's condition lane opens the selected one by deep link. Tracker-only markers have no record.

### 7.4 Encounter budget (2024): XP per character by level

These numbers live in `packages/rules/src/tables.ts`. Numbers in a table are not copyrightable; they still want a check against the published 2024 rules (§11).

| Level | Low   | Moderate | High   |
| ----- | ----- | -------- | ------ |
| 1     | 50    | 75       | 100    |
| 2     | 100   | 150      | 200    |
| 3     | 150   | 225      | 400    |
| 4     | 250   | 375      | 500    |
| 5     | 500   | 750      | 1,100  |
| 6     | 600   | 1,000    | 1,400  |
| 7     | 750   | 1,300    | 1,700  |
| 8     | 1,000 | 1,700    | 2,100  |
| 9     | 1,300 | 2,000    | 2,600  |
| 10    | 1,600 | 2,300    | 3,100  |
| 11    | 1,900 | 2,900    | 4,100  |
| 12    | 2,200 | 3,700    | 4,700  |
| 13    | 2,600 | 4,200    | 5,400  |
| 14    | 2,900 | 4,900    | 6,200  |
| 15    | 3,300 | 5,400    | 7,800  |
| 16    | 3,800 | 6,100    | 9,800  |
| 17    | 4,500 | 7,200    | 11,700 |
| 18    | 5,000 | 8,700    | 14,200 |
| 19    | 6,400 | 10,700   | 17,200 |
| 20    | 8,500 | 13,200   | 22,000 |

The 2024 rules have no encounter multiplier: total creature XP is compared directly with the party budget, the sum of the per-character budgets.

### 7.5 CR → XP and proficiency

CR 0: 10 (0 if the creature has no attacks) · 1/8: 25 · 1/4: 50 · 1/2: 100 · 1: 200 · 2: 450 · 3: 700 · 4: 1,100 · 5: 1,800 · 6: 2,300 · 7: 2,900 · 8: 3,900 · 9: 5,000 · 10: 5,900 · 11: 7,200 · 12: 8,400 · 13: 10,000 · 14: 11,500 · 15: 13,000 · 16: 15,000 · 17: 18,000 · 18: 20,000 · 19: 22,000 · 20: 25,000 · 21: 33,000 · 22: 41,000 · 23: 50,000 · 24: 62,000 · 25: 75,000 · 26: 90,000 · 27: 105,000 · 28: 120,000 · 29: 135,000 · 30: 155,000.

Proficiency bonus by CR: 0–4 +2, 5–8 +3, 9–12 +4, 13–16 +5, 17–20 +6, 21–24 +7, 25–28 +8, 29–30 +9.

---

## 8. Copyright and content policy

This section is binding for the codebase.

1. **Ships in the package:** SRD 5.2.1 and SRD 5.1 content (CC BY 4.0) with their exact attribution statements; optional open third-party documents with their own attribution; game-icons SVGs (CC BY 3.0) with the author credits; the bundled sample campaign (our own adventure text, SRD creatures, and maps by 2-Minute Tabletop under CC BY-NC 4.0, used for pre-1.0 testing and to be replaced or licensed before any release that is not free). Nothing else that is game content.
2. **Never ships, never linked:** any non-SRD text, art, maps or product names from the game's publisher as bundled data; addresses of community compendium repositories or aggregators; token packs licensed for personal use only.
3. **The importer is neutral.** It reads whatever file the DM supplies and stores it in the DM's Library on the DM's computer. The app sends content nowhere; the player connector serves the open campaign only to browsers on the local network while the DM has it on.
4. **Exports** carry `nonSrd` flags derived from the record's source; the UI warns before exporting flagged records.
5. **Trademarks.** The publisher's game names, logo, book titles and setting names are not used in the app name, UI chrome, store listings or README. The app describes itself as "5e-compatible". Book names appear only as data the DM imported (source badges) or as SRD attribution.
6. **No copyrighted art** in the repo: no book covers, no monster illustrations, no publisher maps, in tests and screenshots included.

---

## 9. UX notes

- **Two spaces** (ADR 0004). The **Library** holds what every campaign shares: Campaigns, Compendium (sources and homebrew), Images, Music folders and Settings. The **console** is the inside of one open campaign.
- **The console** is a frameless window with a 34 px top bar (the mark goes to the Library, the campaign breadcrumb switches campaign, then global search, the current layout, Hotkeys and Settings) and three areas:
  - a **stage** of one or two tab groups holding the major tabs: Campaign, Compendium, Encounters (the combat tracker while a fight runs) and VTT, plus any web tabs. Every tab keeps its place when switched or closed; two groups put combat beside the map.
  - a right-hand **dock** of the tall tools, always in this order: Scenes, Music, Quick notes, Counters, Timers. It is wide, narrow (360 px) or icons-only with flyouts, and never hidden.
  - a 42 px **live strip**, or tray, with table state only: what is on the TV with blackout and the player window, round and turn with next and previous, music and mute, single counters and timers, and at its right end the shared dice pool with the Dice button. The DM picks up to four sections from a checklist beside Dice, which always stays (ADR 0023). In the Library the strip is fixed to VTT, Music and Dice.
- **Pop-ups** for Dice (from the strip), Hotkeys and Layouts (from the top bar) anchor to their buttons (ADR 0009).
- **Layouts** capture the chrome (tabs, groups, dock, the strip's sections) and are the DM's to save, overwrite, rename, reorder and delete. Prep, Table and Combat come as starters.
- **Web tabs** (ADR 0011): the stage's `+` menu adds a tab for an address the DM types, hosted in a sandboxed webview in one persistent session, so a hosted document or sheet sits beside the console and reopens where it was left. The list is Library-wide and saved with the layouts; close parks a tab, remove forgets it; modifier hotkeys reach through the page; every web tab has Open in system browser.
- **Widths** (ADR 0014): every stage panel works from 480 px and every dock tool from 360 px. When the window narrows, the dock folds to icons first, then two groups fold into one stack (display only; the saved layout returns when the window widens). The window's minimum is 760 px, so Trifold can take half a screen. Feature layouts change columns only at 640 or 960 px.
- **Look**: dark theme by default, light available. The "Slate and bone" palette (near-monochrome slate with a warm bone accent; ally, enemy, healthy, bloodied and down carry the color). Outfit for UI text and IBM Plex Mono for numbers, both bundled. A 13 px base size and one control scale shared by buttons, icon buttons and fields: 30 px for content, 26 px for chrome, 22 px for row actions, which are always on screen and quiet until their row is hovered, focused or selected (ADR 0020). Nothing under 12 px except keycaps and badges. [UI-GUIDELINES.md](UI-GUIDELINES.md) has the rules for every control, size and common action.
- **Keyboard-first**: every table-time action has a hotkey, registered in one `hotkeys.ts`; the hotkey sheet is one key away (`Ctrl+/`). `Ctrl` means Cmd on macOS. `Ctrl+F` finds anything by name and lands on it.
- **No modal dialogs during combat**, and no toasts: a failure shows as a banner in the panel that asked.
- **Never lose work**: autosave on every change; a daily backup zip and one on close, optionally copied to a second folder; restore from any backup zip in Settings, also on first run. A campaign exports on its own as a `.trifold-campaign`, as it is or as a fresh start, with or without the party, its homebrew and its layout, never with imported sources or music (ADR 0015).
- **Sample campaign** (ADR 0016): every Library gets *The Lantern at Greyford* once, built from `samples/greyford/` at build time. Deleting it is final; Settings adds it back or resets it.
- **Update check** (ADR 0034, ADR 0045): off until the DM turns it on. The Library asks once; Settings › Updates has the switch and Check now. With it on, Trifold reads the project's public releases list after every launch and daily while open, sending only its version, and shows a quiet **Update available** button in the top bar. The installed Windows build then downloads the update in the background, refuses it unless its manifest's signature verifies, and installs it only when the DM presses **Restart now**; it never restarts by itself. The portable exe and macOS open the release page in the browser instead.
- **Performance budgets**: compendium search under 50 ms on 5,000 monsters; index rebuild under 10 s on a 30 MB XML file; scene switch to the TV under 150 ms; token drag at 60 fps on a 4096 px map, with player-window frame updates within 16 ms; app start to campaign open under 3 s warm. The smoke test checks the search budget; the rest are checked by hand.

---

## 10. What is built and what comes next

### The session-ready core (M1)

The core a DM needs to run a session works end to end on Windows 11 and macOS with a second display:

1. **Compendium:** bundled SRD 2024 and 2014, conditions and rules included; XML import with the lenient parser and every convention in `DATA-FORMATS.md` §2; sources enabled per campaign; browse and search with filters; stat blocks in the 2024 layout with clickable spells and roll buttons.
2. **Campaign:** campaigns, a notes tree with templates and phrase search, NPCs and PC cards with carried HP, Fight Club GM export import.
3. **Encounters and combat:** the builder with the 2024 budget; initiative; the turn loop with recharge and legendary pools; conditions with durations; damage with type math, temp HP and the concentration prompt; death saves; attack, multiattack and save-call buttons; the roll log.
4. **Presenter:** the player window on a chosen display; the scene tree; title card, image, map and blank-grid scenes; image import; grid alignment; generated tokens; party placement; player camera presets; overlays, blackout and the break screen; start combat from a scene.
5. **Music:** folder scan, tags, playlists, crossfades on every transition, loudness normalization, output device selection, panic mute, scene-linked playlists.
6. **Dice:** the roller with its log.
7. **Homebrew:** editing a copy of any record.
8. **Backups**, and opening the Library folder.

**Acceptance test:** import a 30 MB compendium file in under 60 s; build a six-encounter one-shot with twelve scenes; run a 30-minute mock session on a second display without a crash, with music crossfading between scenes. It is run by hand; `pnpm smoke` drives a shorter version of it on both platforms, against the dev build or a packaged one.

Around that core the app also has the console shell with layouts, global search and deep links, quick notes, counters, timers, the TV tab, paused and carried-over fights, phone audio, web tabs, backups to a second folder and campaign export, the sample campaign, homebrew editors for every kind, per-campaign sources and campaign creatures, the CR scaler and quick scale, fog of war, the movement ruler, the session log, rules in the compendium, creature art, the opt-in update check, and the player connector.

### Releases

- **Alpha (current):** GitHub Releases, Windows and macOS, unsigned, for a few testers on several machines, to find and fix the major bugs. The README covers the SmartScreen and Gatekeeper steps; macOS builds are signed ad hoc so Gatekeeper shows its ordinary prompt.
- **Beta:** Windows only, on itch.io, once the Windows build is code-signed. Mac testers stay on GitHub Releases.
- **1.0:** macOS notarization (Developer ID, hardened runtime) and a public Mac release.

### Beta

The beta's list, in priority order, with each item's state:

| #   | Item                                                                     | State                                        |
| --- | ------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | Windows code signing, so SmartScreen stops warning (`RELEASING.md`)      | Next                                         |
| 2   | Opt-in update check, in-app updates on Windows (ADR 0034, ADR 0045)      | Built                                        |
| 3   | Edit a creature where it is and choose at Save (§6.2, ADR 0035)          | Built                                        |
| 4   | Replace references (§6.2)                                                | Built                                        |
| 5   | Per-campaign sources (§6.1, ADR 0036)                                    | Built                                        |
| 6   | Encounter assistant (§6.4)                                               | On hold, to see whether quick scale is enough |
| 7   | Fog of war, shapes (§6.5)                                                | Built                                        |
| 8   | CR scaler (§6.2, ADR 0038)                                               | Built                                        |
| 9   | Movement ruler (§6.5)                                                    | Built                                        |
| 10  | Session log (§6.3, ADR 0040)                                             | Built                                        |
| 11  | Rules in the compendium (§6.7, ADR 0041)                                 | Built, without the 2024 Rules Glossary       |
| 12  | Creature art (§6.8, ADR 0033)                                            | Built; campaign export leaves it out         |
| 13  | XML export of homebrew or any source (§6.2, `DATA-FORMATS.md` §2.15)    | Planned                                      |
| 14  | Player connector (§6.5, ADR 0043, `PLAYER-CONNECTOR.md`)                 | Built                                        |

### Later

May come after the beta; new ideas land here first. Not in priority order.

- Fog of war with a freehand brush and soft edges.
- Subclass editors (subclasses need a data model first).
- Hex grids.
- Importing the PDF character sheet a player exports from their character builder, read locally, if the PDF carries form fields.
- Optional open third-party content (§6.1), each document's license checked and shipped with its notices.

Ambience and effects layers, stingers and ducking, `[[links]]` between notes, drag-and-drop art on records, and pre-filling PCs from an online character service are out of scope (ADR 0029).

---

## 11. Open questions

- The 2024 encounter budget and CR tables in `packages/rules/src/tables.ts` still want a check against the published 2024 rules (§7.4).
- Fight Club GM export: the importer reads a `<campaign>` with one `<pc>` and merges by name, tested on a synthetic file only. It needs a real export (`DATA-FORMATS.md` §3.3).
- Mixed-DPI displays for the player window on macOS, which has not had the hands-on check Windows had (ADR 0006).
