# Trifold — Design Document

**Status:** v0.2, 2026-11-07. Source of truth for what the app is and why. It describes the app as built; a feature that is specified here but not yet built is marked **(not built; beta)** or **(not built; later)** (§10 orders them), and §10 lists what shipped.
**Companion docs:** `DATA-FORMATS.md` (file formats, parsing rules, schemas), `CLAUDE.md` (repo conventions).

---

## 1. What Trifold is

Trifold is a local desktop application (Windows and macOS) for a Dungeon Master running D&D 5e (2024 rules) campaigns and one-shots at a physical table. It replaces two apps the DM currently uses (Lion's Den *Game Master 5th Edition* and *Fight Club 5th Edition*) and adds what they lack: a presenter mode for a second screen and a music controller.

The app is a **DM console**. Players are not users. They build characters wherever they like (D&D Beyond, Fight Club, paper) and hand the DM a few numbers.

### 1.1 Six parts

1. **Compendium** — bundled SRD content (2024 and 2014) plus the DM's own imported XML files; browse, search, homebrew editors.
2. **Campaign** — adventures, NPCs, notes, lightweight PC cards.
3. **Encounters & combat tracker** — initiative, HP, conditions, automated stat-block rolls, 2024 encounter budgets.
4. **Presenter** — a second window on a TV/monitor showing scenes (title cards, images, maps with grid and tokens), driven from the console.
5. **Music** — local-file player with layered music, ambience and effects, crossfades, scene linking.
6. **Dice & reference** — roller with a log, DM-screen rules pages from SRD text.

### 1.2 Non-goals (explicit)

- No character builder or player-facing character sheets.
- No accounts, no cloud backend, no sync between users, no web client (v1; the beta's player connector will amend this, ADR 0032). The app never phones home; the only pages it loads from the network are the web tabs the DM opens (ADR 0011).
- No virtual tabletop features beyond what §6.5 specifies (no dynamic lighting, no line-of-sight).
- No bundled non-SRD content, ever. No links to community repositories baked into the app.
- No map making. Maps are images the DM supplies.

### 1.3 Timeline

A one-shot in ~2 weeks drives a **session-ready cut (M1)**. What follows is the beta, then later (ADR 0029). See §10.

---

## 2. Decision log

Settled decisions, in one place. Rationale is in the sections that follow.

| Area | Decision |
|---|---|
| Platform | Electron app for Windows and macOS from one codebase, platform-specific code limited to build, menu, title bar and the primary modifier key (ADR 0006). Web-tech UI (React + TypeScript). |
| Backend | None. Fully local. No accounts. |
| Storage | Files-first Library folder (JSON + media). SQLite is a rebuildable index only. |
| Rules edition | 2024 rules are native. 2014 content is "legacy", allowed per campaign, with light automatic conversion. |
| Bundled content | SRD 5.2.1 (2024) and SRD 5.1 (2014), both CC-BY 4.0, from an Open5e snapshot taken at build time. Attribution shown in-app. Optional open third-party content (e.g. Kobold Press via Open5e) as a later add. |
| User content | Lion's Den compendium XML import (neutral importer, lenient parser). Game Master campaign XML import. Fight Club "GM export" import. Nothing is hosted or shared. |
| Players | Represented by PC cards (name, HP, AC, saves, passives, portrait…). No sheets. |
| Homebrew | New-from-scratch or Duplicate-then-edit for monsters, items, spells, feats, species, backgrounds, conditions and classes (ADR 0026). Subclasses later. Duplicate is a universal verb (encounters, scenes, NPCs, PC cards, playlists). |
| Presenter | Second Electron window on a chosen display. Scene tree of any depth. Tree click selects; Enter, double-click or ▶ sends (ADR 0004); hover shows a thumbnail; undo-last-scene hotkey. The TV tab shows the selected scene of any kind and holds every screen control; the live strip only mirrors the one-tap ones (ADR 0008). Party placed by clicking anywhere on the map each time (entry markers were removed, ADR 0008). Player-window overlays (scene title, initiative strip, PC health bars, round counter, counters, timers) are individually toggleable; scene title is a global toggle with per-scene override. |
| Token art | game-icons.net (CC BY 3.0) silhouettes rendered as generated tokens; "engraved" treatment default, "flat" alternative. Custom art by Set art… on a token; creature art for every copy and an Images section in the Library, shrunk to 512 px (beta, ADR 0033). |
| Music | Local files only (MP3/OGG/FLAC/WAV/M4A). A music player with crossfade on every transition. Per-track loudness normalization. Output device selection. Scene-linked playlists. Complete as it stands: ambience and effects come from the phone (ADR 0029). |
| Update check | Off until the DM turns it on (the Library asks once; Settings › Updates has the switch and Check now). Then at most once a day, after launch, it reads the project's public releases list with only the app's version in the request, shows a quiet Update available button in the top bar, and Download opens the release page in the browser. Never downloads or installs. State in `config.json`. See ADR 0034. |
| Phone audio | On Windows, Trifold is the Bluetooth audio receiver (the OS's AudioPlaybackConnection API driven by a bundled PowerShell helper, no native module): paired phones are listed, remembered once used, and connect in one click, never automatically. On macOS the Phone tab is an AirPlay Receiver guide with deep links. Both state what Trifold cannot control from there. An "Audio source" toggle on the Music tool and the live strip switches between Trifold's player and the phone. See ADR 0007. |
| Name | Trifold. No WotC trademarks in name, UI, or marketing. Described as "5e-compatible". |
| Fog of war | Beta: a shape mask per scene (ADR 0029). A brush later. |
| Player connector | Beta, last item: a local-network page players open to claim and run their own creatures, off until the DM starts it (ADR 0032, `docs/PLAYER-CONNECTOR.md`). Not built; §1.2 and ground rule 1 are amended before it is. |
| Copyright posture | Lion's Den model: ship SRD only; import anything the user supplies; export flags records derived from non-SRD content. |
| Native module pins | `electron` and `better-sqlite3` are pinned together to versions with prebuilt binaries (currently Electron 42 / better-sqlite3 12.11.1); no compiler on install. Window routes use the URL hash. See ADR 0001 and ADR 0002. |
| Console layout | Library space plus a console per open campaign: a tabbed stage (one or two groups) for the majors, a right dock for the minor tools, a live strip for table state. Palette "Slate and bone", type Outfit + IBM Plex Mono (bundled, OFL). See ADR 0004 (supersedes 0003). The presenter is two pieces: Scenes (the list, dock) and TV (the screen, stage); the live strip mirrors one-tap actions and is never a control's only home. See ADR 0008. Dice, Hotkeys and Layouts pop up from their own buttons (strip, top bar) and the dock keeps the tall tools, Music and Scenes. See ADR 0009. |
| Search and deep links | One global search in the middle of the top bar (`Ctrl+F`): names and titles across notes, NPCs, party, encounters, scenes, compendium and web tabs, plus the phrase inside note bodies and other campaign notes, ranked exact › prefix › word › substring and grouped by type; the campaign half ranks in memory, the compendium half asks the SQLite index. Every result opens through one deep-link contract, `navigate({ type, id, anchor? })`, which brings the item's tab or tool forward (a closed tab lands away from the VTT, then away from a running fight, else in the focused group), selects it and flashes it; note links and the like reuse it. See ADR 0017 and `docs/DEEP-LINKS.md`. In the Library the same field searches every campaign and opens the one a result is in (ADR 0024). |
| Quick notes | A dock tool (`Ctrl+N`) for writing something down mid-session without leaving the current tab: a required title, the formatted body and a Save button; the note goes into a Quick Notes folder that is made when missing and found by its role, not its title. Quick notes are ordinary notes; moving one out of the folder makes it ordinary. See ADR 0018. |
| Counters | A dock tool (`Ctrl+Alt+C`) of small numbers the DM tracks at the table, kept per campaign one file each: name, initial value, optional min and max the value is clamped to, a primary step (1) and an optional alternate step. Buttons for each step, a typed value, reset, edit, delete with the inline confirm, drag to reorder; the arrow keys change a focused counter (no mouse wheel); a counter on a bound is marked and a change that runs into one flashes. Up to three can be shown on the TV (bottom-left), with a Counters overlay switch on the TV tab. See ADR 0019. |
| Timers | A dock tool (`Ctrl+Alt+T`) of real-world countdowns kept per campaign as definitions (name, duration, chime): presets 30s / 1m / 5m or a typed duration; start, pause, resume, reset, edit, delete; any number at once. Runs are timestamps, never ticks, and reset on restart. At zero the row alerts, the dock icon carries a pip and an optional chime plays on the sfx layer without touching music. One timer can be on the TV, large in the bottom-left corner, with a Timers overlay switch. See ADR 0021. |
| Encounters and combat | One Encounters tab: the list and builder, replaced by the combat tracker while a fight is loaded; Back pauses it, and any number of fights can wait in progress for a split party (ADR 0022). A built encounter can be placed on a map as hidden tokens, positioned, then started. See ADR 0005. HP carries between fights for PCs and named NPCs; during a fight the tracker owns hidden and dead and the map follows; combatants and tokens on the map in play are tied by identity, with turn-order badges on linked tokens and a plus on unlinked ones. See ADR 0012. |
| Campaign notes | A tree of folders (the scene tree's helpers) beside the open note, which saves itself as it is edited; Party, NPCs and Notes are sub-tabs of the Campaign tab. Folders replace Adventures in the UI; the record stays for imports. Phrase search with snippets and note templates follow in the same series. See ADR 0010. |
| Backups and campaign export | Daily and manual Library zips can also be copied to one folder the DM chooses (another drive, or a folder a sync app keeps); Trifold itself never uploads. Every zip carries a manifest; restore works from any file, including on first run, and replaces rather than merges. A campaign exports on its own as a `.trifold-campaign`, as it is now or as a fresh start, with or without the party, its homebrew and its layout, never with imported sources or music. See ADR 0015. |
| Sample campaign | One sample campaign ships with the app (our own adventure text, SRD creatures, maps by 2-Minute Tabletop under CC BY-NC 4.0 for pre-1.0 testing, to be replaced or licensed before a release that is not free), built from `samples/` at build time as a `.trifold-campaign`. Every Library, new or existing, gets it once; deleting it is final; Settings adds it back or resets it. See ADR 0016. |
| UI consistency | One control scale (regular 30 px, compact 26 px for window chrome, row 22 px), 6 px control radius, icon size set by the button, a 12 px type floor (11 px for keycaps and badges), and one pattern per common action. `docs/UI-GUIDELINES.md` is the rulebook for new UI. See ADR 0013. |
| Panel widths | Every stage panel has a 480 px floor and every dock tool 360 px. The window decides what fits: the dock folds to icons first, then two groups fold into one stack (display only, the saved layout returns when the window widens). Window minimum 760 px, so Trifold can take half a screen. Feature layouts switch columns only at 640 or 960 px, and inner parts follow their own width. See ADR 0014. |
| Taking a scene off the TV | Take off TV (the live scene's stop button, the TV tab, the strip, `Ctrl+Shift+X`) ends the scene and leaves the overlays up; Blackout stays the curtain over everything. Undoable. See ADR 0030. |
| Roll log and pins | The Dice pop-up's log reads oldest first with the newest roll, and its reveal, at the bottom; the reveal plays only for a fresh roll. A roll can be pinned to the campaign under a name until unpinned. See ADR 0031. |
| Web tabs | The stage `+` menu adds a web tab: an address the DM typed, hosted in a sandboxed Electron webview in one persistent session, so a hosted document or sheet sits beside the console as a tab and reopens where it was left at the next launch. Library-wide list stored with the layouts; close parks, remove forgets; modifier hotkeys reach through the page; every tab has Open in system browser. See ADR 0011. |

---

## 3. Users and workflows

There is one user: the DM, on one Windows or macOS computer (ADR 0006) with a second display (TV or monitor) at the table.

**Prep (days before):** import content → build the campaign (adventures, NPCs, notes) → enter PC cards from what players sent → build encounters from the compendium → build the scene tree (title cards, maps with grid alignment, pre-placed creatures) → tag music, build playlists, link them to scenes.

**At the table:** open campaign → open player window on the TV (blackout) → click scenes as the party moves → click the map to drop the party on it → start combat from the scene → run initiative, roll attacks and saves from stat blocks, apply damage, track conditions → music crossfades with scene changes and combat → end combat, tokens gray out, back to exploration.

**After:** notes and encounter results stay in the campaign folder. The Library folder can be zipped, copied, or synced with OneDrive/Dropbox for use on another machine.

---

## 4. Architecture

### 4.1 Shell and UI

- **Electron** (current LTS), packaged with electron-builder as an NSIS installer plus a portable exe on Windows and a dmg plus zip on macOS (ADR 0006). No code signing yet, so the README documents the SmartScreen and Gatekeeper prompts; Windows signing is first in the beta, and macOS notarisation comes with 1.0 (§10, release phases).
- **Renderer:** React 18 + TypeScript + Vite. State in Zustand stores. Validation with Zod schemas shared between main and renderer.
- **Main process** owns: the Library (all file I/O), the SQLite index, window management (console + player window), display enumeration, global shortcuts, backups.
- **Two renderer windows:** `console` (DM) and `player` (presenter). Both load the same bundle with a different entry route. The player window is `frameless`, opened fullscreen on the chosen display via `screen.getAllDisplays()`, and never receives keyboard focus by default.
- **State flow for the presenter:** the console holds authoritative presenter state (live scene, camera, tokens, overlays). Changes are sent to main via IPC and re-broadcast to the player window. The player window is a pure view: it never mutates state. Target: token drag updates reach the player window within one frame at 60 fps.
- **Audio** runs in the console renderer via the Web Audio API (`AudioContext` with one `GainNode` per layer and per track). Output device selection via `AudioContext.setSinkId` (available in the pinned Electron); see §6.6.

### 4.2 The Library (files-first)

All user data lives in one folder the user picks on first run (default `Documents/Trifold Library`). Human-readable JSON with a `schemaVersion` on every file; media beside the data. SQLite (`index.sqlite`) is derived from the files and can be deleted at any time; the app rebuilds it on launch if missing or stale (file mtimes + a content hash per source).

```
Trifold Library/
  library.json                 settings, schemaVersion, last-open campaign
  index.sqlite                 derived; safe to delete
  sources/                     imported compendium sources (one folder each)
    <sourceId>/
      source.json              name, kind (xml|open5e|homebrew), file hash, enabled, edition tag rules, license flags
      original.xml             the imported file, untouched
      records.jsonl            normalized records, one JSON object per line
  homebrew/
    <recordId>.json            editable records (based-on provenance inside)
  art/
    <kind>/<recordKey>.png     custom token/portrait overrides for compendium records
  campaigns/
    <campaignSlug>/
      campaign.json
      adventures/<id>.json
      notes/<id>.json          markdown body inside
      npcs/<id>.json
      pcs/<id>.json            PC cards
      encounters/<id>.json
      scenes/<id>.json
      counters/<id>.json       the Counters dock tool's counters (ADR 0019)
      timers/<id>.json         the Timers dock tool's timer definitions (ADR 0021)
      images/                  scene images (copied in) + generated display-size versions
      tokens/                  custom token art for this campaign's PCs/NPCs
      creatures/<id>.json      the campaign's own creatures (ADR 0035), its own compendium source
  templates/
    notes/<id>.json            note templates (name + markdown body), shared by every campaign
  music/
    library.json               scanned folders, per-track tags and gain, loop trims
    playlists/<id>.json
  backups/
    <date>.zip                 daily rolling backup of everything except index.sqlite and music files
```

Rules:
- Every write is atomic (write temp file, fsync, rename). Never partial-write a JSON file.
- Media referenced by path is never moved or renamed by the app. Music files are referenced in place; scene images are **copied** into the campaign folder so campaigns are portable.
- Bundled SRD content is **not** in the Library; it ships inside the app package and is indexed alongside Library sources with `sourceId = "srd-2024"` / `"srd-2014"`.
- Multiple Libraries are supported (switch in settings); one is open at a time.

### 4.3 The index

SQLite via `better-sqlite3`, in the main process. Tables mirror the record kinds with the columns needed for lists and filters; an FTS5 virtual table indexes names and text for search. The full record JSON is stored as a column so lists never read from disk. Budget: search over 5,000+ monsters returns in <50 ms; cold rebuild of the index from a 31 MB XML source in <10 s.

### 4.4 Boundaries that keep options open

The renderer talks to main through one typed API (`window.trifold.*`) generated from a single TypeScript interface. No direct `fs` or `sqlite` calls in the renderer. This is the seam that would let a browser client or a LAN server exist later; it costs nothing now.

---

## 5. Data model

IDs are ULIDs. Every stored object has `id`, `schemaVersion`, `createdAt`, `updatedAt`.

### 5.1 Compendium

**Source** — `{ id, name, kind: "srd"|"xml"|"open5e"|"homebrew", filePath?, fileHash?, enabled, license: { spdx?: string, attribution?: string, nonSrd: boolean }, importedAt, recordCounts }`

**Record** (one per compendium entry; `data` shape depends on `kind`)
`{ id, kind: "monster"|"spell"|"item"|"feat"|"species"|"background"|"class", key, name, displayName, sourceId, sourceBook?: string, sourcePage?: number, edition: "2024"|"2014"|"unknown", tags: string[], basedOn?: { recordId, sourceId }, data: <kind-specific> }`

- `key` = normalized name (lowercase, punctuation stripped, edition tag removed). Used for cross-references, duplicate detection and export.
- `edition` derives from the `[5.5e]` name suffix, the source book name, or the source's default. See `DATA-FORMATS.md` §2.10.
- Records with the same `key` and different `edition` are presented as one entry with an edition switch. A campaign's `preferredEdition` decides which is shown by default.

**Monster.data** (normalized from XML; original text preserved)
`{ size: "T"|"S"|"M"|"L"|"H"|"G", type, subtype?, alignment, ac: { value, note? }, hp: { average, formula? }, speeds: { walk?, fly?, swim?, climb?, burrow?, hover?, notes? }, abilities: { str, dex, con, int, wis, cha }, saves: Record<Ability, number>, skills: Record<string, number>, proficiencyBonus?: number, initiativeBonus?: number, senses: string, passivePerception?: number, languages, cr: string, xp: number, damageVulnerabilities: string[], damageResistances: string[], damageImmunities: string[], conditionImmunities: string[], environment: string[], isNpc: boolean, ancestry?: string, sortName?: string, description?: string, traits: Feature[], actions: Feature[], bonusActions: Feature[], reactions: Feature[], legendary: { perTurn?: number, header?: string, actions: Feature[] }, lair: Feature[], spellcasting?: { spells: string[], slots?: number[] } }`

**Feature** — `{ name, displayName, text, uses?: { count, per: "day"|"turn"|"shortRest"|"longRest" }, recharge?: { min: number, max: 6 }, attacks: Attack[], saves: SaveCall[] }`
`Attack` — `{ label, toHit?: number, damage: DiceExpr, damageType?: string, reach?: string, range?: string }` (from the XML attack triple plus text parsing)
`SaveCall` — `{ ability, dc, halfOnSuccess?: boolean }` (from text parsing)

Spell, Item, Feat, Species, Background, Class keep the XML fields as typed properties (see `DATA-FORMATS.md` §2) plus `text`. Items add `{ typeCode, rarity?, requiresAttunement?, magic: boolean, modifiers: Modifier[] }`.

### 5.2 Campaign

**Campaign** — `{ id, name, slug, preferredEdition: "2024", allowLegacy: boolean, enabledSourceIds (unused, ADR 0036), settings: { playerOverlays: { sceneTitle, initiativeStrip, pcHealthBars, roundCounter }, tokenStyle: "engraved"|"flat"|"twoTone"|"plain", hpDisplayMode }, activeAdventureId? }`

**Adventure** — `{ id, name, summary, sceneIds: string[], encounterIds: string[], noteIds: string[], order }`

**Note** — `{ id, kind: "note"|"folder", title, body (markdown), tags, links: EntityRef[], parentId?, order }` (a tree like scenes: `parentId` is the folder, `order` the place among siblings; new notes go last in their folder; ADR 0010)

**NPC** — `{ id, name, recordRef?: RecordRef (stat block), portrait?, role, location?, notes, isAlive, hp?: { current, max, temp } }` (`hp` is what the last fight left, ADR 0012)

**CampaignCounter** — `{ id, name, initial, value, min?, max?, step (primary, default 1), altStep?, showOnTv?, order }` (whole numbers; `min ≤ max` and `initial` inside them when set; `value` is held inside the bounds; ADR 0019). Not the combatant `Counter`, which lives inside a fight.

**CampaignTimer** — `{ id, name, durationSec (1 s to a day), chime (default true), showOnTv?, order }` (a definition only; whether it runs is the console's and is never stored; ADR 0021)

**PCCard** — `{ id, name, playerName, classText, level, maxHp, currentHp?, tempHp?, ac, initiativeBonus, speed, passives: { perception, insight, investigation }, spellSaveDc?, saves: Record<Ability, number>, portrait?, dndBeyondUrl?, notes, tokenStyleOverride? }` (`currentHp` absent means full; both carried between fights, ADR 0012)

**Encounter** — `{ id, name, sceneId?, combatants: CombatantTemplate[], notes, difficultyCache?, state?: CombatState }`
`CombatantTemplate` — `{ ref: PCRef|RecordRef|NPCRef, label?, quantity, role: "ally"|"enemy"|"neutral", hpOverride?, hidden: boolean, tokenId? }`
`CombatState` — `{ round, turnIndex, combatants: Combatant[], log: LogEntry[], lairInitiative?: 20 }`
`Combatant` — `{ id, name, maskedName, ref, role, initiative, hp: { current, max, temp }, conditions: ConditionInstance[], concentrating?: { on, since }, counters: Counter[], deathSaves?: { successes, failures }, dead, hidden, tokenId? }`

**Scene** — `{ id, kind: "title"|"image"|"map"|"blankGrid", title, showTitleOverride?: boolean|null, parentId?, order, notes, image?: { path, displayPath, width, height }, backdrop?: "parchment"|"stone"|"dark", grid?: { cellPx, offsetX, offsetY, color, opacity, showToPlayers }, tokens: Token[], entryMarkers: { id, name, x, y }[], audio?: { playlistId?, ambienceIds: string[] }, encounterId?, playerCamera: { mode: "fitMap"|"fitTokens"|"follow"|"manual", x, y, zoom } }`

**Token** — `{ id, kind: "pc"|"creature"|"marker", ref, label, x, y (grid units, fractional allowed), footprint: 1|2|3|4, hidden, nameMasked, art?: path, color? }`

### 5.3 Music

**Track** — `{ id, path, title, artist?, album?, durationSec, gainDb (normalization), tags: string[], loop?: { startSec, endSec }, kind: "music"|"ambience"|"sfx" }`
**Playlist** — `{ id, name, trackIds: string[], shuffle, loop, crossfadeSec? }`

### 5.4 Cross-references

`RecordRef = { recordId, sourceId, key, edition }`. Encounters, tokens and NPCs store the full ref so a re-imported source can be re-linked by `key` if IDs change. When a referenced record is missing (source disabled or deleted), the UI shows the cached name with a warning, never a crash.

---

## 6. Module specifications

### 6.1 Compendium and sources

**Bundled SRD.** A build script (`scripts/fetch-open5e.ts`) pulls the SRD 5.2.1 and SRD 5.1 documents from Open5e's v2 API (or the JSON in the open5e-api repository), normalizes them into Trifold `Record`s, and writes `resources/srd-2024.jsonl` and `resources/srd-2014.jsonl` into the app package. The snapshot is versioned in the repo's lockfile-style manifest (`resources/srd-manifest.json` with document keys, counts, fetch date, license texts). Optional third-party open documents (Kobold Press Tome of Beasts, etc.) would use the same path as an opt-in **(not built; later)**.

**XML import.** Library › Compendium › Import file. Accepts Lion's Den compendium XML (`<compendium>`), Game Master campaign XML (`<campaign>`), and Fight Club GM exports (a `<campaign>` containing a `<pc>`). Import runs in the main process, streams the file (31 MB files must not block the UI), writes `original.xml` + `records.jsonl`, and indexes. Re-importing the same file (by hash) is a no-op; importing a changed file diffs by `key` and reports added/changed/removed counts. Sources can be enabled/disabled globally and deleted. **Per-campaign sources** (ADR 0036): an imported file can show in every campaign or only in the campaigns it names (`Source.campaignIds`), set from its row on the Sources page. A campaign file's own stat blocks start as that campaign only. With a campaign open, the compendium, builder and search answer only from the sources it sees; with none open, every enabled source shows.

**Lenient parser rules.** Unknown elements are preserved in `data.extra`. Missing fields never fail an import; they produce warnings listed on the source page. Names match case-insensitively for cross-references. See `DATA-FORMATS.md` for every field and convention found in real files.

**Browse and search.** One list per kind (monsters, spells, items, feats, species, backgrounds, classes, conditions) with a persistent filter bar: text search (FTS), source, edition (2024 / legacy / all), CR range, type, size, environment, and the **Named** filter (stat blocks an imported book marks as a named character, `isNpc` in the record; the word NPC is kept for campaign characters). Monster rows show name, CR, type, size, a Named badge, source badge, edition badge. A monster's detail ends with **Used by**: the campaign NPCs in any campaign whose stat block it is (by record id, or by key in the same source after a re-import), each a link; one in another campaign opens that campaign first. Detail panes render the stat block in a 2024 layout regardless of the record's edition; original text is available in a "source text" tab. Spell references inside stat blocks and item text are clickable when the spell exists in an enabled source.

**Edition handling.** See §7.

**Attribution.** Settings → About lists every enabled source's license text. The SRD attribution statements (exact wording from each SRD document) and the game-icons author list are always shown.

### 6.2 Homebrew and duplication

- **One Edit** (ADR 0035), wherever the record is: a compendium record's page, a creature's row in the encounter builder, a compendium creature in the tracker. It opens that kind's editor in the same panel: on the DM's own record as it is, on any other as a copy not yet written (records from the SRD or an imported file never change). Library › Compendium's **New homebrew** opens it on a blank record or on a copy of one found by name. **Duplicate to homebrew** was retired.
- **Save asks, inline** in the editor's pinned header (never a modal), showing only the choices that apply; **Confirm** writes and **Back** returns to the form. The **name**: one listed in the Library's compendium must not match a record there, since records with one name share a row; the step names the record that has it and offers the next free name, never with brackets. **Where it lives** (ADR 0037's words): *This campaign only* (the default; a campaign creature) or *All campaigns* (Library homebrew); for the DM's own record, *Update it* or *Save as new*. **Where to use it**, narrowest first: from a fighter *Just Goblin 2* (it leaves its group as a row of its own) or *Every Goblin in this fight*; from a builder row *This row* or *Every Goblin in this encounter*; from a record page *Nowhere yet*; and *Every Goblin in this campaign* when other encounters, fights or maps use it. The row or fighter Edit was pressed on takes the creature's name and drops its HP override; wider choices are Replace references.
- **Campaign creatures** (ADR 0035): a campaign's own records in `campaigns/<slug>/creatures/`, one compendium source per campaign, listed only while that campaign is open with **This campaign** as their source pill, and never sharing a row with a Library record. **Use in all campaigns** on one copies it into Library homebrew under its own name. They travel with campaign export; importing as a copy renews their ids.
- Copies carry `basedOn` provenance. The editor shows a "changed from original" diff on request.
- **Monster editor** covers every field in §5.1: ability scores with derived modifiers, saves and skills as proficiency toggles or explicit numbers, AC with note, HP average with formula (and "roll average from formula"), speeds, senses, languages, CR with auto-filled proficiency bonus and XP, damage/condition lists as chips, and feature lists for traits / actions / bonus actions / reactions / legendary / lair with uses, recharge, attack triples and save calls.
- **CR scaler** (ADR 0038): **Scale to another CR…** in the monster editor's Challenge section. Each number moves by how much a typical monster's does between the two CRs (our fit to the SRD 5.2 monsters), so the monster keeps its shape: AC, attack bonuses and save DCs by the difference, HP and damage by the ratio with the same dice sizes (more or fewer dice), saving throws and skills with the proficiency bonus. At a step of 4 CR or more it offers an attack more or fewer in the Multiattack. Every change shows as old → new with a checkbox; **Apply to the form** changes only the form. The name never changes; `scaled: { fromCr, toCr }` shows as a **Scaled CR 1 → 5** tag on the stat block.
- Item, spell, feat, species, background, condition and class editors are simple forms with the same field names as the XML (ADR 0026); classes are built level by level (features, ability score improvement, spell slots). Library › Compendium has **New homebrew**: pick a kind, then start blank or copy an existing record.
- Names must be unique within a kind across enabled sources for export to work; the editor warns on collision and suggests a suffix.
- **Encounter-level tweaks**: a row's label and HP override, set in the builder, live on the encounter. A compendium creature's row has Edit (above) in place of the label pencil, with the label as the copy's name and the HP override as its HP.
- **Replace references**: on the page of a copy that is the DM's own (homebrew or a campaign creature), **Replace <original> in this campaign…** and, while the campaign uses the copy, **Put <original> back in this campaign…**, so a wide choice at Save is never one-way. Each confirms inline with what it would change ("Use Grik in place of Goblin in 3 encounters (5 rows), 1 fight and 4 tokens?") and then switches every encounter row that uses it (every copy in the row), running and paused fights of those encounters (HP, conditions and turn order kept) and map tokens. Rows keep their labels and HP overrides; campaign NPCs keep their stat block. A reference matches by record id, or by key in the same source after a re-import. The builder's open encounter is edited in its own copy so its autosave keeps the change.
- **Duplicate** is also available on encounters, scenes (with or without subtree), NPCs, PC cards, playlists.
- Export homebrew (or any source) **(not built; beta; see DATA-FORMATS.md §2.15)** as compendium XML in Lion's Den format so the files remain usable in Fight Club / Game Master. Exports of records whose `basedOn` source is flagged `nonSrd` show a warning before writing.

### 6.3 Campaign management

- Campaign list on launch; one open at a time. The Campaign tab is three sub-tabs: Party, NPCs, Notes. Notes are a tree of folders beside the open note (ADR 0010): find in notes (a phrase, with context snippets that open the note at that hit), new note, new folder, collapse, drag to reorder or into a folder (scenes drag the same way); the open note is formatted text stored as markdown and saves itself as it is edited; a narrow panel shows the list or the note, not both. Folders took the place of Adventures in the UI; the adventure record stays in the schema and the importer so old campaigns and campaign XML load, and an imported adventure's notes land in a folder named after it. `[[links]]` from notes, deferred in ADR 0010, were dropped in ADR 0029: global search finds every note that names something.
- NPC records can wrap a stat block (any monster record, including the 1,237 `npc`-flagged entries in community files) and carry a portrait, role, location and notes. A named NPC carries HP and the alive flag from fight to fight; any creature in an encounter or a running fight can be turned into one with Track as NPC, and the NPCs tab shows carried HP with Restore (ADR 0012).
- **PC cards and NPCs** share one form pattern, the homebrew editors' titled sections (ADR 0027), shown in place of the tab's list. A short **Required** section comes first: Name, Max HP and AC for a PC (empty until typed; Save waits for all three), Name for an NPC. The rest are **Optional** sections, folded on a new card and opened on edit when they hold something: for a PC *Basics* (player, class, level, initiative bonus, speed), *Senses* (passive Perception, Insight, Investigation), *Combat* (spell save DC, saving throws, and current and temp HP when editing) and *Notes*; for an NPC *Basics* (role, location, alive), *Stat block* (a compendium creature, found by name) and *Notes*. A new form has **Save and add another**, which keeps it open and blank: the quick way to enter a party. Every PC and NPC row has Edit and Delete.
- **Add NPC** (ADR 0037) is the NPCs tab's one plus: **Start a blank NPC**, or search **Other campaigns** (copied as below) or the **Compendium** (optionally named characters only). A compendium creature becomes a named NPC under its name with its own copy of the stat block in this campaign's creatures, so it can change without touching the original. Each NPC row shows where its stat block lives (*This campaign*, *Homebrew*, or the book or file).
- **From another campaign…** beside New PC card, and Other campaigns in Add NPC, lists the PCs or NPCs of every other campaign in the Library, searchable by name or campaign, and copies the one picked: a new id, full HP (an NPC also comes back alive), its notes, stat block link and portrait file. The copy is independent of the original.
- **PC cards** carry current HP, which a fight starts from and writes back when it ends; Long rest on the Party tab heals everyone (ADR 0012). Import from a Fight Club GM export fills what the stat block provides (AC, HP, saves, skills, passives, spells). The one-line Quick add text box was removed: one place to add a PC, not two. Pre-fill from D&D Beyond's undocumented endpoint was dropped (ADR 0029); importing a player's exported PDF character sheet, read locally, is **(not built; later)**.
- Encounter results (XP earned, rounds, casualties) are stored on the encounter (`Encounter.results`). A **session log** **(not built; beta)**: the first fight or live scene on a day opens that day's session entry, which fills itself with the fights (XP, rounds, casualties), the scenes shown and the NPCs who died; the DM adds a free-text recap. XP totals across sessions follow from it.

- **Quick notes** (ADR 0018): a dock tool, also `Ctrl+N` from anywhere in the console, with a title (required; Save stays off without one), the notes editor and a Save button (`Ctrl+S` inside the form; Escape drops the draft). Save files the note in the Quick Notes folder (made at the end of the root when missing, found by `role: quickNotes`) with `capture.at`, and focus returns where the DM was. Below the form, every note in that folder, newest first, with find; one opens with the note pane's tools plus Move to and Open in Notes. A note moved out of the folder is an ordinary note. In-game timestamps are **(not built; later)**.
- **Counters** (ADR 0019): a dock tool, also `Ctrl+Alt+C`, listing the campaign's counters in the DM's order. New counter takes a name, an initial value (0), optional minimum and maximum, a primary step (1) and an optional alternate step. Each counter has −primary and +primary around its value, and −alternate and +alternate outside those when it has an alternate step; clicking the value types one; show on TV (lit while the counter is on the TV), reset, edit and delete (inline confirm) are its row actions, and its range, when it has bounds, sits under the buttons; rows drag to reorder. With focus in a counter, ↑/↓ change it by the primary step, Shift+↑/↓ and PageUp/PageDown by the alternate step (else the primary), Home/End go to a set bound; the mouse wheel never changes a counter. Values are clamped to the bounds; a counter on one shows it, and a change that runs into one flashes. Values save shortly after the last press. Up to three counters marked Show on TV appear on the player window in the bottom-left corner ("Name  value / max"), hidden as a group by the Counters switch in the TV tab's Overlays.
- **Timers** (ADR 0021): a dock tool, also `Ctrl+Alt+T`, of named countdowns in the DM's order. New timer takes a name, a duration (typed as `90`, `1:30`, `2m`, `1m 30s`, or a 30s / 1m / 5m preset) and Chime at zero. Each timer shows its time left and one main button (Start, Pause, Resume, Start again); chime, show on TV, reset, edit and delete (inline confirm) are its row actions; rows drag to reorder; any number run at once. A run is kept as its end time (or the time left while paused), so it never drifts; runs are not stored and every timer is idle after a restart. At zero the row turns red, pulses and says Time's up, the Timers dock icon shows an alert pip, and a chiming timer plays a short tone on the sfx layer (music untouched). One timer at a time can be on the TV, large, above the counters in the bottom-left corner; marking another moves the TV to it.

### 6.4 Encounters and combat tracker

**Encounter builder.** Add PCs (all, or a subset) and creatures from the compendium or from a scene's placed tokens. Quantity, label, role, hidden flag per row. Difficulty uses the **2024 XP budget** (§7.4): sum creature XP (no multiplier) against the party's Low / Moderate / High budget and show which band the encounter lands in, plus XP per PC. **Encounter assistant** **(not built; beta)**: pick environment(s), CR range, edition filter, budget band → generate a set; re-roll individual rows.

**Starting combat.** Roll initiative per creature or per group (setting); PCs prompt for their rolled initiative (or roll from the card's bonus). Surprise flag = disadvantage on that combatant's initiative roll (2024). Lair actions insert a "Lair" entry at initiative 20 when any combatant has lair actions. Ties: Dex, then DM drag.

**Adding mid-fight.** The tracker's bar has Add to fight (hotkey A): a panel with the party members and named NPCs not yet in the fight as one-tap buttons, and a creature search with a quantity. Newcomers join in initiative order, are numbered after any of the same name already present, are kept on the encounter, and tie themselves to a waiting token on the map in play.

**Turn loop.** Active combatant highlighted; Next/Previous; round counter; per-turn automation at start of turn: roll recharge for `recharge` abilities (d6 ≥ min), reset the legendary action pool, expire conditions with `untilStartOfTurn`, prompt for "save at end of turn" conditions at end of turn. Delay/ready: drag to reorder (the hold button was removed, ADR 0012; the `held` field remains for saved fights).

**Stat block panel.** The active combatant's full stat block with buttons:
- **Attack**: rolls to-hit (advantage/disadvantage toggle, crit detection) and damage (rolls the expression; doubles dice on crit) from the attack triple; blank to-hit means damage-only.
- **Multiattack**: rolls every attack named in the Multiattack text in one click.
- **Save call**: from parsed `SaveCall`s: pick targets → auto-roll for creatures (with their save bonus), show DC and each PC's bonus from the card so the DM can read results straight off; apply half/none on success.
- **Spell**: click a spell name to open its record; slot tracker for creatures with `slots`.
- Counters: legendary actions (per turn), Legendary Resistance, N/day uses, custom counters.

**Carrying over.** When a fight ends, each PC's current and temp HP go back to the card and each named NPC keeps its HP and whether it lives; compendium creatures start fresh every time (ADR 0012). The active row's toolbar: hide from the players (strip and map together), mark dead (skull), track as NPC, place on map, remove.

**Damage and healing.** Apply damage with an optional damage type; the tracker halves for resistances, zeroes for immunities, doubles for vulnerabilities, and shows what it did. Temp HP absorbed first. Concentration check prompt when a concentrating combatant takes damage (DC 10 or half damage, whichever is higher). Massive damage / instant death rule shown as a hint. PCs at 0 HP switch to death saves (three successes/failures; nat 20 regains 1 HP; nat 1 counts as two failures). Creatures at 0 HP are marked dead and grayed on the map.

**Conditions.** 2024 list (§7.3) plus tracker markers (Concentrating, Surprised, Hidden, Dead, custom). Each instance has an optional duration (rounds, until start/end of a turn, until save) and a source. Applying a condition a creature is immune to shows a warning. Exhaustion is a level 1–6 with the 2024 effects shown.

**Player-facing display.** The initiative strip on the TV shows masked names (creature type until revealed), portraits/tokens, the active turn and the round; PC health bars optional. Creature HP is never shown exactly; a "bloodied" marker at half HP is optional.

**Log.** Every roll, damage application and condition change is logged with timestamps and kept with the encounter's results.

### 6.5 Presenter

**Windows.** Console + player window. Settings → Displays picks the target display; the player window opens fullscreen there on "Open player window" and remembers the choice. Blackout and undo-last-scene are console hotkeys (`hotkeys.ts`), not OS-level global shortcuts.

**Scene tree.** One tree per campaign; folders allowed; drag to reorder/reparent; duplicate with subtree. Hovering a scene shows its thumbnail and notes in a side panel. **Clicking a scene selects it and previews it on the TV tab; Enter, double-click or ▶ sends it** (ADR 0004). Hotkeys: Alt+Down/Up/Left/Right send the next, previous, parent or first child scene straight to the TV; Ctrl+Alt+Up/Down select the previous or next scene on the TV tab without sending (Ctrl+K is the compendium search). Recent scenes list.

**Scene kinds.**
- *Title card:* text on a backdrop, optional subtitle, optional image.
- *Image:* full-bleed illustration; no grid or tokens; player camera fits the image.
- *Map:* image + grid + tokens.
- *Blank grid:* generated backdrop (parchment / stone / dark) + grid; tokens; for improvised combat.
- Any scene can have DM notes, linked audio, and a linked encounter.

**Images.** Import copies the file into `campaigns/<slug>/images/`, stores width/height, and generates a display-size version (long edge ≤ 4096 px, JPEG, `<id>.display.jpg`) for the player window. Supported: PNG, JPG, WebP.

**Grid.** Square cells, 5 ft each. Per-scene `cellPx`, `offsetX/Y`, color, opacity, `showToPlayers`. Alignment: numeric entry, or a two-click tool (click opposite corners of one cell) that derives cellPx and offset. Snap-to-grid for tokens; hold Alt to place freely.

**Tokens.** PC tokens from cards, NPC tokens from the campaign's NPCs, creature tokens from compendium/encounter, markers. The Add creature or marker pop-up lists the campaign's NPCs above the creature search: an NPC token is sized and masked from its stat block (one cell and "Creature" without one), starts neutral and dead when the NPC is, and like a PC has one token per map, so placing it again moves it. Footprint from size (T/S/M = 1, L = 2, H = 3, G = 4). Drag on the console; the TV mirrors within a frame. Per-token flags: `hidden` (DM-only), `nameMasked` (TV shows creature type), HP display, condition icons, active-turn ring, dead marker. Right-click menu: reveal, mask/unmask, mark dead, remove, set art. During a fight, on the map in play (the live map, else the encounter's map): a token tied to a combatant wears its turn-order number and follows the combatant's hidden and dead flags (the menu's hide and dead act on the combatant); an unlinked PC or creature token wears a plus that ties it to the one matching combatant, offers a choice of several, or adds it as a newcomer; the menu can link, add or unlink. Matching is by identity (same card, NPC, record or custom name), never a name alone (ADR 0012).

**Party placement.** When a map is live, the party is not placed until the DM clicks anywhere on the map (entry markers were built and removed as not useful, ADR 0008; the field stays in the scene file and is ignored); the PC tokens land as a compact cluster around that point (formation: 2-wide column) and can be nudged. No automatic carry-over between scenes. The scene remembers last positions and offers "restore previous positions" when reopened.

**Cameras.** DM camera (free pan/zoom, mouse wheel and drag) and player camera (controlled from the console: fit map, fit tokens, follow active combatant, manual pan/zoom). The console draws the player viewport rectangle over the map. Aspect ratio of the target display is respected; letterboxing uses the scene backdrop color.

**Overlays on the TV.** Scene title (global toggle, per-scene override), initiative strip (top or side), PC health bars, round counter, handout (image or text card that overlays the live scene; rendered by the player but with no console control yet, ADR 0008), break screen (title + optional countdown; music continues), blackout. Take off TV ends the live scene and leaves the overlays up (ADR 0030).

**Transitions.** Scene changes fade over 300 ms in the player window. A per-scene "cut" setting is **(not built; later)**.

**Combat integration.** "Start combat" on a map scene builds an encounter from placed creature tokens (+ PCs) or opens the linked encounter with tokens matched by `tokenId`. "Place encounter…" drops a built encounter's creatures on the map hidden from the players and links it, so the DM can position them before starting (ADR 0005). During combat the active token is highlighted on both screens; killing a combatant grays its token; adding a creature mid-combat prompts for a click position.

**Fog of war** **(not built; beta, ADR 0029):** a mask per scene, saved with it, made of revealed shapes in map pixels: rectangles (snapped to grid cells when the scene has a grid) and polygons, with hide as well as reveal, Reveal all and Hide all, and undo. The player window draws it opaque, the console's map at half strength; tokens whose centre is under fog are not sent to the player and the player camera ignores them. Prep and play use the same tools. A freehand brush and soft edges are **(later)**; line-of-sight reveal is a non-goal (§1.2).

**Movement ruler** **(not built; beta):** drag on a map or blank grid to measure in squares and feet.

**Hex grids** **(not built; later)**.

### 6.6 Music

**Library.** Music tool › Folders. Scan recursively for MP3/OGG/FLAC/WAV/M4A; read tags with `music-metadata`; store references (never copy or move files); rescan on demand, relinking files that moved (DATA-FORMATS.md §5.5). Per track: kind (music / ambience / sfx), mood tags (free text with suggestions: combat, tension, tavern, travel, eerie, sad, triumphant, boss), gain, loop trim. **Loudness normalization**: on first scan, measure integrated loudness per track (EBU R128 via an offline `AudioContext` pass, or `ffmpeg`-free JS implementation) and store `gainDb` to bring tracks to a common target (−16 LUFS). Runs in a background worker; tracks are playable before measurement finishes.

**Player.** One music player in one audio graph; master volume; panic mute (console hotkey). The engine also has ambience and effects layers, and tracks can be tagged with those kinds, but nothing plays on them: ambience and effects come from the phone (ADR 0029), and the Music tool is complete as it stands.
- *Music:* playlist queue, play/pause, next/previous, shuffle, loop. **Every transition crossfades** (equal-power curve) over the configured duration (default 4 s, range 1–10 s), including "stop" (fade out) and "start" (fade in). The next track is pre-decoded so a crossfade starts on the keypress.

**Phone audio** (ADR 0007). The Music tool's Phone tab makes this computer the phone's speaker, so Spotify, a soundscape app or anything else on the phone plays through the table speakers. On Windows 11 Trifold is the receiver itself: the tab lists the paired phones, the ones used before first, and one click on a phone brings up the Bluetooth link and the audio together (never automatically at launch); a hidden helper keeps the connection open and reconnects when the phone wanders. Pairing a new phone is a button into Bluetooth settings. On macOS the tab is a two-step AirPlay Receiver guide (iPhone and iPad) with a button into the right settings pane. The OS carries the audio to its default output, so it bypasses Trifold's output choice and panic mute; the tab says so and points at the system sound settings. An **Audio source** toggle at the top of the Music tool chooses between "This computer" (Trifold's player, tabs and transport) and "Phone" (only the phone panel); choosing Phone pauses Trifold's player and makes its transport, hotkeys and scene links inert, and the live strip shows the phone's name, state and one Connect or Disconnect button instead of the player controls. The choice is remembered per machine; the phone still connects only by a click.
- Output device selection (list from `enumerateDevices`), remembered.

**Scene linking.** A scene may set a playlist (an ambience set is still stored on the scene so old files load, and is not played). On scene change: if the playlist differs, crossfade to it. Encounters may set a combat playlist: starting combat crossfades to it and remembers what was playing; ending combat crossfades back. All automatic changes can be disabled per scene ("keep current audio").

### 6.7 Dice and reference

- Roller: a dice pool built by clicking (each click on d4…d100 adds one; right-click takes one away), a modifier stepper, advantage/disadvantage for a lone d20, then Roll. One pool is shared app-wide: the Dice pop-up and the live strip's pool show and edit the same selection (ADR 0009). A typed expression (`2d6+3`, `4d6kh3`, `d20 adv`) remains as a secondary field. Roll log shared with combat and the compendium, oldest first with the newest roll at the bottom; any roll can be pinned to the campaign under a name until it is unpinned (ADR 0031). Roll sounds are **(not built; later)**.
- Rules **(not built; beta, ADR 0029)**: the SRD rules text (actions, cover, travel, exhaustion, etc.) as a Rules kind in the compendium, one per edition like conditions, searchable and reachable by deep link. Custom pages are what notes are for. Verify the SRD documents carry the rules as separate sections before building.

### 6.8 Token art pipeline

- Build step `scripts/fetch-game-icons.ts` clones `github.com/game-icons/icons`, copies the SVGs into `resources/icons/svg/` with a `manifest.json`, and generates `resources/icons/credits.json` from `license.txt` (author list) for the About page.
- Token renderer: SVG glyph inside a disc. Treatments: **engraved** (parchment disc, dark glyph, brown ring; default), **flat** (type-colored disc, white glyph, dark ring), **two-tone** (dark disc, type-colored glyph), **plain** (disc + initials). Ally/enemy ring color. Rendered to bitmap once per (glyph, treatment, size) and cached.
- Glyph selection chain for creatures: custom art → `ancestry` table → name keyword table (species and humanoid roles) → synonym table (undead/beast families) → creature-type default. Items: name keyword table → item type code table. Spells: school table. The item and spell tables live in `resources/icons/mapping.json` beside the creature tables and have lookups in `packages/rules`, but only creature tokens are rendered today. Unmatched names are logged so the tables can grow.
- Custom art: a map token's menu has Set art…, which copies the image into the campaign for that one token. Drag-and-drop onto records was dropped (ADR 0029).
- **Creature art** **(not built; beta, ADR 0033)**:
  - **Set art…** asks **This token** or **Every <name>**. Every copy saves the art for the creature: compendium creatures in the Library's `art/` folder, shared by every campaign; PCs and NPCs in their campaign's `tokens/` folder. It shows on every token of that creature, existing or placed later, on its compendium page, PC card or NPC. A token's own art wins over its creature's, and custom art always wins over generated tokens. Remove returns to the generated token.
  - **Images** in the Library is a mini compendium of everything that can be a token: compendium creatures (including homebrew), and every campaign's PCs and NPCs. Search, filters for **needs art**, type, source and campaign; add, replace or remove art per row. **Add from folder** matches files to rows by filename (case-insensitive, punctuation stripped, edition tags ignored) and lists matches and misses before applying. Items, spells and other kinds have no art.
  - **Size:** every image added this way is shrunk to fit 512 × 512 and saved as PNG (transparency kept); the original is not kept. Backups carry only these copies (about 150–400 KB each).

### 6.9 Global search and deep links

- **Search box** in the middle of the console's top bar (`Ctrl+F`; a button under 960 px). Matches names and titles only: notes and folders, NPCs, PCs (and player names), encounters (and their members' names, listed after name matches as "with …"), scenes (title and subtitle), compendium records of every enabled kind, web tabs. Case-insensitive, punctuation and apostrophes folded, ranked exact, prefix, start of a later word, anywhere; grouped in a fixed order with six rows per group and a count of the rest. Arrows move, Enter opens, Escape clears; results pop up under the field and update on every keystroke. The campaign half ranks in memory (`rankByName`, @trifold/rules); the compendium half is `compendium.suggest` on the index after an 80 ms debounce. From two characters on, a **Mentioned in** group also finds the phrase in note bodies and in the notes on encounters, NPCs, PCs and scenes, one row per item with a snippet and its mention count; a note opens at that occurrence, an encounter with the phrase selected in its DM notes. A **Compendium text** group does the same for record text through the FTS index. Any group with more rows than it shows has **Show all**, which lists that group alone in full until Back or Escape. Music is left out by choice.
- **Deep links.** `navigate({ type, id, anchor? })` (ADR 0017, `docs/DEEP-LINKS.md`) opens a note (at a phrase), folder, NPC, PC, encounter (at a DM-notes phrase), scene, record or web tab: it brings the home forward, the owning panel selects the item, scrolls to it and flashes it. A closed tab lands in the only group, else away from the VTT, then away from a running fight, else in the focused group; an open tab is never moved.

---

## 7. Rules edition handling (2024 native)

### 7.1 Edition tagging
Each record has `edition`. Sources: `[5.5e]` suffix in the name → 2024; source book name in a known 2024 list (e.g. "Monster Manual (2025)", "Player's Handbook (2024)") → 2024; SRD 5.2.1 → 2024; SRD 5.1 → 2014; otherwise the source's default (2014 for community files, configurable).

### 7.2 Legacy content in a 2024 campaign
`allowLegacy` (default on) shows 2014 records with a "legacy" badge. Conversions applied at display/use time, never written back:
- Monsters: used as-is. Initiative bonus = Dex modifier when `init` is absent. Proficiency bonus from CR when the "Proficiency Bonus" trait is absent.
- Spell/feature text: shown unchanged; the tracker's parsers accept both 2014 and 2024 attack/save phrasing.
- Conditions: 2024 definitions apply (e.g. exhaustion levels).
- Duplicate entries across editions and sources collapse to one list row with a version dropdown on the record. The row shows the record from the highest-priority source (Library › Compendium › Sources, ADR 0027), its source as one pill, and a + when other versions exist; the campaign's `preferredEdition` only breaks a tie inside one source.

### 7.3 Conditions (2024)
Blinded, Charmed, Deafened, Exhaustion (levels 1–6: −2 × level to d20 tests, −5 ft × level speed, death at 6), Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious. Tracker-only markers: Concentrating, Surprised (disadvantage on initiative), Hidden, Dead, Bloodied (display threshold only, at ≤ half HP).

The rules text of each condition is a compendium record (`kind: condition`, one per edition) fetched from the SRD documents at build time like every other kind; the Compendium tab lists them under Conditions and the tracker's condition lane opens the selected one through a deep link (ADR 0017). Tracker-only markers have no record.

### 7.4 Encounter budget (2024 DMG) — XP per character by level
Verify these numbers against the DMG (2024) before release; tables of numbers are not copyrightable and the values below are from memory.

| Level | Low | Moderate | High |
|---|---|---|---|
| 1 | 50 | 75 | 100 |
| 2 | 100 | 150 | 200 |
| 3 | 150 | 225 | 400 |
| 4 | 250 | 375 | 500 |
| 5 | 500 | 750 | 1,100 |
| 6 | 600 | 1,000 | 1,400 |
| 7 | 750 | 1,300 | 1,700 |
| 8 | 1,000 | 1,700 | 2,100 |
| 9 | 1,300 | 2,000 | 2,600 |
| 10 | 1,600 | 2,300 | 3,100 |
| 11 | 1,900 | 2,900 | 4,100 |
| 12 | 2,200 | 3,700 | 4,700 |
| 13 | 2,600 | 4,200 | 5,400 |
| 14 | 2,900 | 4,900 | 6,200 |
| 15 | 3,300 | 5,400 | 7,800 |
| 16 | 3,800 | 6,100 | 9,800 |
| 17 | 4,500 | 7,200 | 11,700 |
| 18 | 5,000 | 8,700 | 14,200 |
| 19 | 6,400 | 10,700 | 17,200 |
| 20 | 8,500 | 13,200 | 22,000 |

No encounter multiplier in 2024: total creature XP is compared directly against the party budget (sum of per-character budgets).

### 7.5 CR → XP and proficiency
CR 0: 10 (0 if the creature has no attacks) · 1/8: 25 · 1/4: 50 · 1/2: 100 · 1: 200 · 2: 450 · 3: 700 · 4: 1,100 · 5: 1,800 · 6: 2,300 · 7: 2,900 · 8: 3,900 · 9: 5,000 · 10: 5,900 · 11: 7,200 · 12: 8,400 · 13: 10,000 · 14: 11,500 · 15: 13,000 · 16: 15,000 · 17: 18,000 · 18: 20,000 · 19: 22,000 · 20: 25,000 · 21: 33,000 · 22: 41,000 · 23: 50,000 · 24: 62,000 · 25: 75,000 · 26: 90,000 · 27: 105,000 · 28: 120,000 · 29: 135,000 · 30: 155,000.
Proficiency bonus by CR: 0–4 +2, 5–8 +3, 9–12 +4, 13–16 +5, 17–20 +6, 21–24 +7, 25–28 +8, 29–30 +9.

---

## 8. Copyright and content policy

This section is binding for the codebase.

1. **Ships in the package:** SRD 5.2.1 and SRD 5.1 content (CC-BY 4.0) with their exact attribution statements; optional open third-party documents with their own attribution; game-icons.net SVGs (CC BY 3.0) with the author credits; the app's own rules-reference pages (written from SRD text). Nothing else that is game content.
2. **Never ships, never linked:** any non-SRD WotC text, art, maps or names of products as bundled data; URLs of community compendium repositories or aggregators; token packs licensed for personal use only.
3. **The importer is neutral.** It reads whatever file the user supplies and stores it in the user's Library on the user's machine. The app does not transmit content anywhere.
4. **Exports** carry `nonSrd` flags derived from the record's source; the UI warns before exporting flagged records.
5. **Trademarks.** The name "Dungeons & Dragons", "D&D", the ampersand logo, book titles and setting names are not used in the app name, UI chrome, store listings or README. The app describes itself as "5e-compatible". Source book names appear only as data the user imported (source badges) or as SRD attribution.
6. **No copyrighted art** in the repo: no book covers, no monster illustrations, no WotC maps, including in tests and screenshots.

---

## 9. UX notes

- Dark theme default; light theme available. Two spaces (ADR 0004): the **Library** (campaigns, compendium sources and homebrew, music folders, settings) and the **console**, the inside of exactly one open campaign. The console is a frameless window with a 34 px top bar (mark → Library, campaign breadcrumb → switcher, current layout, Hotkeys, Settings), a **stage** of one or two tab groups holding the majors (Campaign, Compendium, Encounters, VTT (the TV tab); Encounters becomes the combat tracker while a fight runs; every tab keeps its place when switched or closed; two groups is how combat sits beside the map; TV shows the selected scene and carries every control for the screen, ADR 0008), a right-hand **dock** of the tall minor tools (Scenes, Music, Quick notes, Counters, Timers, in that order in every layout, ADR 0018, ADR 0019, ADR 0021, ADR 0023) that is wide, narrow (360 px), or icons-only with flyouts (never hidden since ADR 0009; it folds to icons on its own when the panels need the room, and two stage groups fold into one stack below that, ADR 0014), pop-ups for Dice (from the strip), Hotkeys and Layouts (from the top bar) that anchor to their buttons (ADR 0009), and a 42 px **live strip** with table state only: what is on the TV with blackout and the player window, round and turn with next/previous, music and mute, and at its right end the shared dice pool with the Dice button. The DM chooses up to four of its sections (VTT, Music, Encounters, single counters and timers, in that order) from a checklist beside Dice, which always stays (ADR 0023); in the Library the strip is fixed to VTT, Music and Dice (ADR 0024). Layouts capture the chrome (tabs, groups, dock, the tray's sections) and are the DM's to save, overwrite, rename, reorder and delete; Prep, Table and Combat are copied in as starters.
- Look: "Slate and bone" palette (near-monochrome slate, warm bone accent; ally, enemy, healthy, bloodied and down carry the colour). Outfit for UI text, IBM Plex Mono for numbers. Compact: 13 px base; one control scale (30 px content, 26 px chrome, 22 px row actions, always on screen and quiet until their row is in use, ADR 0020) shared by buttons, icon buttons and fields. The rules for every control, size and common action are in `docs/UI-GUIDELINES.md` (ADR 0013).
- Keyboard-first: every table-time action has a hotkey; a cheat sheet is one key away. `Ctrl+F` finds anything by name from the top bar and lands on it (ADR 0017).
- Never lose work: autosave on every change; daily backup zip; "restore backup" in settings.
- Performance budgets: compendium search < 50 ms; scene switch to TV < 150 ms; token drag at 60 fps on a 4096 px map; app start to campaign open < 3 s warm.

---

## 10. Milestones

### M0 — Scaffold (days 1–2)
Electron + Vite + React + TS + Zod + Zustand + better-sqlite3 + electron-builder; two windows; typed IPC API; Library folder creation with atomic writes; settings; empty console shell with the left rail; CI running lint, typecheck and Vitest.

### M1 — Session-ready cut (done)
Everything below works end to end on Windows 11 and macOS. Where the shape changed on the way, the ADR is cited.

1. **Compendium:** bundled SRD 2024 + 2014 (Open5e snapshot, including the conditions); XML compendium import with the lenient parser and all conventions in `DATA-FORMATS.md` §2; source enable/disable; monster/spell/item browse and search with source and edition filters; stat block view in 2024 layout with clickable spells.
2. **Campaign:** create campaign; notes as a tree of folders with templates and phrase search (folders replaced adventures in the UI, ADR 0010; `[[links]]` deferred, later dropped in ADR 0029); NPCs with carried HP (ADR 0012); PC cards with quick add and Fight Club GM export import.
3. **Encounters & combat:** builder with 2024 budget; initiative (per creature/group, PC prompt); turn loop with recharge and legendary pools; conditions with durations; damage with type math, temp HP, concentration prompt; death saves; attack/multiattack/save-call buttons; roll log.
4. **Presenter:** player window on chosen display; scene tree with click-to-live, hover preview, hotkeys, undo; title card / image / map / blank grid scenes; image import with display-size generation; grid with two-click alignment; tokens with generated art (engraved + flat), drag mirroring, hidden/masked/dead states; party placement by clicking the map; player camera presets and viewport rectangle; overlays (scene title, initiative strip, PC health bars, round counter), blackout, handout, break screen; start combat from scene.
5. **Music:** folder scan, tags, playlists; music layer with crossfade on every transition; per-track normalization (finishes in the background); output device selection; panic mute; scene-linked playlists. Ambience and effects layers were deferred, then dropped in favour of phone audio (ADR 0029).
6. **Dice:** roller with log.
7. **Homebrew:** Duplicate + edit for monsters only.
8. **Backups** and "open Library folder".

Acceptance test: import the DM's 31 MB compendium file in under 60 s; build a 6-encounter one-shot with 12 scenes; run a full mock session on a second display for 30 minutes without a crash, with music crossfading between scenes. Run by hand; the smoke test (`pnpm smoke`) automates a shorter version on both platforms, and the performance budgets in `CLAUDE.md` are not yet automated tests.

### Built beyond M1
The shell (ADR 0004, 0009, 0013, 0014), global search and deep links (ADR 0017), quick notes (ADR 0018), counters (ADR 0019), timers (ADR 0021), the TV tab (ADR 0008), fights that carry over with mid-fight additions and token links (ADR 0012), phone audio (ADR 0007), web tabs (ADR 0011), note templates and phrase search (ADR 0010), campaign export and import as `.trifold-campaign` plus a second backup location and restore from file (ADR 0015), a bundled sample campaign (ADR 0016), a macOS build (ADR 0006), the edition switch on a record, relinking music rescans, multiple Libraries with a recent list, the smoke test against a packaged build, and homebrew editors for every kind with New homebrew in the Library (ADR 0026).


### Release phases
- **Alpha (now):** GitHub Releases, Windows and macOS, unsigned, for a few testers on several machines. The aim is to find and fix the major bugs; the README covers the SmartScreen and Gatekeeper steps.
- **Beta:** Windows only, on itch.io, with the features below. Mac users stay on the GitHub releases.
- **1.0:** macOS notarization (Developer ID, hardened runtime) and a public Mac release. Nothing else is decided for Mac until then.

### Beta (in priority order)
What the beta adds, built top to bottom (ADR 0029). M2 and M3 became this list and Later.

1. **Windows code signing**, so SmartScreen stops warning on install, before the itch release (§4.1, `RELEASING.md`).
2. **Check for app updates** **(built, ADR 0034):** opt-in and off by default; the Library asks once, Settings › Updates has the switch and Check now; at most once a day it reads the project's public releases list, shows a quiet Update available button in the top bar, and Download opens the release page; never installs anything itself. It serves the GitHub testers as well as itch downloads made in a browser (the itch app updates its own installs).
3. **Save to compendium** **(built; reworked by ADR 0035)**: Edit on a fight's or an encounter's creature opens the editor on a copy, and Save can put it in that row, the fight, the encounter or the campaign (§6.2).
4. **Replace references** **(built)**: a homebrew copy takes a stock creature's place in this campaign's encounters, fights and maps, and the original can be put back (§6.2).
   - **Edit in place, choose at Save** **(built, ADR 0035)**: one Edit on a creature wherever it is (builder, tracker, record page) opens the editor there; Save then asks where it lives (this campaign or my compendium), its name, and where to use it, showing only the choices that apply. Adds **campaign creatures** (`campaigns/<slug>/creatures/`), which Beta 5 reuses, and is where the CR scaler (8) will live.
5. **Per-campaign sources** **(built, ADR 0036)**: each imported source says which campaigns show it, set beside source priority (ADR 0027) (§6.1); `Campaign.enabledSourceIds` was superseded. The stat blocks a **campaign file** brings in (Game Master campaign XML) are enabled for that campaign only, so an adventure's own characters do not fill every other campaign's Monsters list; the DM can still enable that source elsewhere. Copying such an NPC with **From another campaign…** then brings its one stat block along, into the new campaign's own campaign-only stat blocks (made when first needed), so the copy never points at a stat block its campaign cannot see and the rest of the old adventure stays behind.
6. **Encounter assistant:** environments, CR range, edition and difficulty band in, a budget-fitting group out, any row re-rolled (§6.4).
7. **Fog of war, phase 1:** a shape mask per scene with rectangle and polygon reveal and hide (§6.5).
8. **CR scaler** **(built, ADR 0038)**: in the monster editor, a new CR shifts AC, HP, attack bonuses, damage, save DCs, saves and skills by how much a typical monster changes, keeping dice sizes; an attack more or fewer is offered at big steps; the name stays and a Scaled tag shows (§6.2).
9. **Movement ruler** on map and blank-grid scenes (§6.5).
10. **Session log:** one entry per session day, filled from what happened, with the DM's recap (§6.3).
11. **Rules in the compendium:** the SRD rules text as a Rules kind, per edition (§6.7).
12. **Creature art:** Set art… on a token for that token or every copy of the creature, and an Images section in the Library to find what still needs art and add it one at a time or from a folder; images shrunk to 512 px on the way in (§6.8, ADR 0033).
13. **XML export** of homebrew or any source (§6.2, `DATA-FORMATS.md` §2.15).
14. **Player connector:** players on the same Wi-Fi open a browser page the DM's Trifold serves, claim a PC or a non-enemy NPC, and edit its HP, AC and conditions, submit initiative, move its token and spawn summons; started from the VTT tab, off until the DM starts it, local network only, the DM keeps authority. Four phases (ADR 0032, `docs/PLAYER-CONNECTOR.md`).

### Bugs
Gaps in what is already built, fixed before the beta ships. Not in priority order.

None open. The first round (the PC and NPC forms, NPCs on the map, Used by and Named) was fixed in PRs #17 to #19.

### Later
May come after the beta; new ideas land here first. Not in priority order.

- Fog of war, phase 2: a freehand brush and soft edges.
- Subclass editors (subclasses need a data model first, ADR 0026).
- Hex grids.
- Character import from the PDF character sheet a player exports from their character builder, read locally (verify the PDF carries form fields first).
- Optional open third-party content (§6.1), each document's license checked (OGL 1.0a, CC-BY, ORC) and shipped with its notices.

Removed (ADR 0029): ambience, effects, stingers and ducking; `[[links]]` and backlinks in notes; drag-and-drop art on records; pre-fill from an undocumented character endpoint.

---

## 11. Open questions and assumptions

Still open:

- Whether the 2024 SRD includes the encounter budget and CR tables as text; the numbers in `packages/rules/src/tables.ts` are used as facts (not copyrightable) and still want a check against the DMG.
- Fight Club GM export: the importer handles a `<campaign>` with one `<pc>` and merges by name, tested on a synthetic fixture only; confirm with a real export (see `DATA-FORMATS.md` §3.3).
- Mixed-DPI displays for the player window on macOS (Windows was checked on real hardware; ADR 0006).

Closed:

- Open5e endpoint names and document keys: `scripts/fetch-open5e.ts` pins `srd-2024` and `srd-2014` and records them in `resources/srd-manifest.json`.
- Loudness measurement: a pure JS EBU R128 pass (`features/music/loudness.ts`), no native dependency.
- `setSinkId`: `AudioContext.setSinkId` works in the pinned Electron and is used directly.
