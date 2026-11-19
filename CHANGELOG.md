# Changelog

All notable changes to Trifold. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Dates are ISO.

## [Unreleased]

### Added

- **Loading splash**: when Trifold takes more than a moment to open, a small window shows the turning mark and what it is doing ("Opening your Library…") until the console is ready. Quick launches never show it.

### Changed

- **Final brand**: a rust hexagon inside a three-part frame replaces the sword mark everywhere: app and installer icons, the DMG background, the top bar, the About card and the README banner. Small Windows icons sit on a dark tile so the mark stays visible on a light taskbar.
- **Softer accent**: the dark theme's bone accent (primary buttons, focus, the current turn) is now a darker version of the logo's cream instead of a yellow sand, so the app and the logo share one warm grey. Amber stays the warning colour.

## [0.4.1] - 2026-11-15

Fixes and polish from table testing.

### Added

- **Roll a creature's own rolls from its stat block**: the ability table's Mod and Save columns, each skill, initiative and the hit dice are roll buttons, in the compendium and in the tracker (where they go to the fight's log). Shift-click rolls with advantage, Ctrl-click with disadvantage.
- **Numbered creatures everywhere**: creatures of the same name are numbered across an encounter (Goblin 1, Goblin 2), on their tokens and in the tracker, and a second goblin added on the map is Goblin 2. Players see the same number behind a mask (Humanoid 2) on the TV's initiative strip, its tokens and their phones.
- **Break in the tray**: while a break is up, the tray's VTT section says **Break** with its countdown, in red, and **End break** is red.
- **Companion icon**: a figure with a spark marks companions on the compendium page and the phone; the paw now only means adding a creature to the map.

### Changed

- **Companions**: the DM side uses the phone's word. **Campaign › Summons** is now **Campaign › Companions**, with **New companion** and **Available as a companion** on a creature's compendium page. "Summon" stays the word for bringing one into play.
- **The TV's initiative strip stays on one row**: it starts at whoever's turn it is, shrinks its chips a little in a big fight and folds the rest into a **+N** chip. The map's name keeps its own corner beside it.
- The update-check question on the Campaigns page is a gold banner, with its buttons side by side.

### Fixed

- A phone move no longer fails with "The drag ran out" after the phone slept or briefly lost Wi-Fi.
- Phones show the break screen while a map is live.
- The break countdown on phones matches the TV, whatever the phone's clock says.
- A player's move from their phone shows its ruler on the DM's map.
- Dragging a panel divider or the dock's edge counts as a change to a layout, so **Overwrite** saves the new width.
- Bonus actions and reactions in a stat block can be clicked to roll, like actions.

## [0.4.0] - 2026-11-15

Everything since 0.3.0: the player connector, creature art, the rules compendium, fog of war, the movement ruler, the session log and the CR scaler, among others.

### Added

- **Players on their phones** (Beta 14, ADR 0032 and ADR 0043): **Player devices** (the phone icon in the VTT tab's TV tools) → **Let players join** starts a table server on your private network; it is off until you start it and nothing leaves the LAN. Players scan the join code in a browser (no install, no account) and pick a character: every party member by default, and an NPC once you tick **Players can claim this character** (or use the phone button in a selected token's actions). From then on their phone shows:
  - **What the TV shows**: the map with fog (only what is revealed, and only tokens they may see), title cards, images and the break screen.
  - **Their character** (Health, Conditions, Companions and Move tools, laid out for portrait, landscape and tablets): damage, healing, temp HP, max HP and AC; conditions during a fight; a box asking for initiative when the fight waits on them. The fight log names the device.
  - **Move**: any drag opens Move and waits for **Done**; a faded copy marks where the move began and a ruler measures it, on the phone and on the TV. Adjusting a planned move keeps measuring from the start. A drop under fog or off the map is refused, and your own grab always wins.
  - **Summons** from your list in **Campaign › Summons**: add from the compendium, make a new one or customise one. A player picks a summon, it appears next to their token, joins the fight on their side and goes when they dismiss it.
  - **Player devices** in the console: who is connected and as whom, release a claim, how a dropped phone gets back in (PIN or your approval), **Lock movement** for everyone or one device, and **Give to** a player for an NPC. An NPC can be a **Companion of** a PC.

- **Creature art** (ADR 0033): set a creature's art once and it shows on every token of it in every campaign and on its compendium page; PCs and NPCs get a portrait on their card and tokens. **Library › Images** shows what still needs art, with Add from folder matching files by name. Pictures are fitted to 512 px as they come in, so backups stay small.
- **Compendium tabs fold into More** (ADR 0042): the kinds never scroll out of sight; those that do not fit go into a **More** menu, and they are now in table-time order (Monsters, Spells, Conditions, Rules, Items first).
- **Rules in the compendium** (ADR 0041): a **Rules** sub-tab with the SRD rules chapters, one entry per rule with its section and formatted text (tables included): 239 rules from SRD 5.1 (Dash, Cover, Travel Pace, Spellcasting…) and 58 from SRD 5.2.1. The 2024 Rules Glossary is not in the source data yet.
- **Session log** (ADR 0040): **Campaign › Sessions** fills itself with each session's fights (XP and XP per PC), the scenes shown on the TV and the NPCs who died, takes your title and recap, and totals the campaign's XP. A session runs until play stops for six hours.
- **Movement ruler** (Beta 9): **Ruler** in the map toolbar (`R`) measures in squares and feet (5 ft a square, diagonals too), and dragging a token shows how far it has moved. The TV shows the same line and reading, except under fog or for a hidden token.
- **Fog of war** (ADR 0029, phase 1): reveal and hide parts of a map with rectangles (snapped to the grid) and polygons, Reveal all, Hide all and undo. The TV shows the fog opaque and never receives tokens under it; you see it as a light hatched mist that shows on dark and light maps.
- **CR scaler** (ADR 0038): **Scale to another CR**, at the top of the monster editor's Challenge section, moves hit points, armor class, attack bonuses, save DCs, damage, saving throws and skills by how much a typical monster changes between the two CRs, keeping dice sizes; offers an attack more or fewer at big jumps; shows every change before you apply it. The name stays; a **Scaled CR** tag marks it.
- **NPC stat blocks in the NPC form** (ADR 0039): the pencil edits the NPC and its stat block together, CR scaler included; a shared stat block becomes this NPC's own copy in the campaign, and carried HP and encounters follow.
- **Encounter difficulty and quick scale** (ADR 0038 §7): the difficulty band, XP and a budget meter sit in one row at the top of the encounter builder; **Scale** gives each creature a CR picker and the band follows your picks before you apply them.
- **Add PC** and **Add NPC** (ADR 0037): one plus on each tab with the same menu: start blank, import from another campaign, or (NPCs) turn a compendium creature into a named NPC with its own copy of the stat block in this campaign. Each NPC row shows where its stat block lives in a short pill. Deleting an NPC says where it is used, takes it out of those encounters, fights and maps, and deletes a stat block that was only this campaign's.
- **Per-campaign sources** (ADR 0036): an imported file can show in every campaign or only in the ones you tick, from its row in Library › Compendium › Sources. A Game Master campaign file's stat blocks start as that campaign only, and ones imported before this are linked to the campaign that uses them. Copying an NPC from another campaign brings its stat block along when this campaign can't see it.
- **Edit, then choose at Save** (ADR 0035): one **Edit** on every record, on a creature's row in the builder and on a fighter in the tracker, opening the editor right there. Save asks the name, where to keep it (this campaign or your compendium; for your own, update or save as new) and where to use it (just this one, this fight or encounter, the campaign), showing only what applies; Confirm writes it. **Duplicate to homebrew**, the book icon and the choice above the editor are gone.
- **Campaign creatures**: a campaign keeps its own creatures, shown in the compendium only while it is open; **Use in all campaigns** copies one into your homebrew. They travel with campaign export.
- **Replace references**: a homebrew copy's page offers **Replace <original> in this campaign…**, which shows what will change and then switches every encounter row, fight and map token that uses the original (labels and HP overrides stay), and **Put <original> back…** to undo it. Save to compendium can also use the copy everywhere in the campaign (DESIGN.md §6.2).
- **Save to compendium** on a creature row in the encounter builder and on a creature in the tracker: opens the homebrew monster editor on an unsaved copy named after the row's label and with its HP override; Save keeps it in homebrew and, with **Use it in …** ticked, puts it in that encounter's row, fight and tokens in place of the original (DESIGN.md §6.2).
- An opt-in update check (ADR 0034): the Campaigns page asks once, Settings › Updates has the switch and Check now, and with it on Trifold reads the project's public releases list at most once a day and shows an **Update available** button in the top bar. Download opens the release page; nothing is installed for you.
- Global search in the middle of the top bar (`Ctrl+F`): notes, folders, NPCs, party, encounters and their members, scenes, compendium records and web tabs by name, grouped and ranked, with keyboard navigation (ADR 0017).
- One deep-link contract, `navigate({ type, id, anchor? })`, that opens an item in its tab or tool, selects it and flashes it; a closed tab lands away from the VTT and a running fight. Documented in `docs/DEEP-LINKS.md` for note links and other features to reuse.
- Global search finds text too: a Mentioned in group lists notes, encounter DM notes and NPC, PC and scene notes that contain the phrase, with a snippet, and opens a note at that occurrence.
- Global search also searches compendium text (a Compendium text group with snippets, from the index), and any group can Show all to list only that type in full.
- `compendium.suggest`: a name-only lookup across every kind on the index, for search.
- Quick notes (ADR 0018): a dock tool and `Ctrl+N` to write a titled note mid-session without leaving the current tab; notes go into a Quick Notes folder that is made when missing, and the tool lists and edits every note in it.
- Conditions in the compendium: the SRD 5.1 and 5.2.1 condition texts are fetched at build time with the rest of the snapshot, listed under a Conditions tab, found by search, and opened from the combat tracker's condition lane.
- A sample campaign, *The Lantern at Greyford*: every Library gets it once, and Settings › Sample campaign adds it back or resets it (ADR 0016). Maps by 2-Minute Tabletop (CC BY-NC 4.0, for pre-1.0 testing), with night/day and flood variants; our own adventure text and SRD creatures.

### Changed

- Where something lives is now *This campaign* or *All campaigns* everywhere: the Save step, **Use in all campaigns** (was Add to my compendium), and campaign creatures' source pill.

### Fixed

- **The fight is whoever is here** (ADR 0044): starting a fight from a map brings in the PCs with a token on that map, linked encounter or not; from the Encounters tab, the PCs the encounter names; and the whole party when either would leave nobody. Before, a party standing on the map was left out of its linked encounter, and an unlinked map pulled in PCs from elsewhere.
- NPCs can be added and edited on the NPCs tab (**New NPC**, and Edit on every row); before, an NPC came only from an import or Track as NPC and could not be changed afterwards.
- The PC card form is in titled sections: Name, Max HP and AC are required and start empty (they used to default to 10 without saying so); Basics, Senses, Combat and Notes are optional and folded on a new card. **Save and add another** replaces the one-line Quick add box, which is removed.
- **From another campaign…** on the Party and NPCs tabs copies a PC or NPC from any other campaign in the Library, at full HP, independent of the original.
- A campaign NPC can be placed on a map directly: the map's Add creature or marker pop-up lists the campaign's NPCs, each sized and masked from its stat block, starting neutral, one token per map. Before, an NPC reached a map only inside a placed encounter.
- A monster's stat block ends with **Used by**: the campaign NPCs, in any campaign, that use it as their stat block, each a link to the NPC.
- The compendium's NPC badge and filter are now **Named** and **Named characters only**, so "NPC" means only a character in a campaign.
- A save made while a backup was running (the daily one at start, or the one at close) could stop the app with a "JavaScript error occurred in the main process" box. A file that changes during a backup is now read as it is when its turn comes, and a backup that hits a missing file tries again instead. Campaign export reads its media the same way.

## [0.3.0] - 2026-11-07

Everything since the 0.2.0 install pass; the first release built by the release workflow.

### Added

- MIT licence for the code (`LICENSE`, shown by the installer).

- Shell: Library space plus a per-campaign console with a tabbed stage, dock, live strip and saved layouts (ADR 0004); pop-up Dice, Hotkeys and Layouts (ADR 0009); one control scale and UI guidelines (ADR 0013); panel floors and folding (ADR 0014); layouts decide which tabs are open, with new starters.
- TV tab that shows the selected scene and holds every screen control (ADR 0008).
- Campaign notes as a tree of folders with autosave, templates and phrase search (ADR 0010).
- Web tabs hosted in a sandboxed webview (ADR 0011).
- Phone audio: Windows as Bluetooth receiver, macOS AirPlay guide, Audio source toggle (ADR 0007).
- macOS build and CI on both platforms (ADR 0006).
- Fights carry over: PC and named-NPC HP persist, the tracker drives the map, add to a running fight, token links by identity (ADR 0012); one add panel, encounter notes in the fight, heal and temp HP.
- Backups: second backup location, restore from any zip, on-close backup; campaign export and import as `.trifold-campaign` (ADR 0015).
- Smoke test coverage for all of the above on narrow CI runners.
- Release readiness: build guard (`pnpm check:content`) that refuses to package without the fetched SRD snapshot and icon set; app icon rendered from the logo (`pnpm make:icon`); release workflow that builds the Windows installer and portable exe and the macOS dmg and zip for Apple Silicon and Intel from a `v*` tag and drafts a GitHub release; font licences shipped beside the app's resources.
- Logs go to the app's `userData/logs/` until a Library is open, so a failure to open one still leaves a trace.
- User guide, releasing guide, docs index and this changelog.
- Tests for the audio engine's fades, the player-window scene derivation and the close-campaign flow.

### Changed

- Packaged Windows builds no longer carry Electron's stock menu (Alt no longer reveals it); packaged macOS builds drop the Reload and Developer Tools menu items.
- macOS builds are ad-hoc signed so a downloaded build shows Gatekeeper's ordinary prompt instead of "damaged".
- Artifact names no longer contain spaces: `Trifold-Setup-<version>-win-x64.exe`, `Trifold-Portable-<version>-win-x64.exe`, `Trifold-<version>-mac-<arch>.dmg`.
- The portable exe unpacks once into `%TEMP%\Trifold` and reuses it.
- Player-window colours are tokens in `global.css` (`--tv-*`, `--token-*`) instead of literals.
- `DESIGN.md` describes the app as built and marks what is still planned; `DATA-FORMATS.md`, `CLAUDE.md`, the README and ADR 0006 brought up to date.

### Removed

- Dead code left from earlier shapes: the hold toggle (ADR 0012), the adventures IPC namespace, unread shell state and unused exports, dead CSS selectors. A saved fight that still carries `held` has it cleared on resume.

## [0.2.0] - 2026-10-01

First clean-machine install pass: the session-ready cut (`DESIGN.md` §10 M1).

### Added

- Compendium: bundled SRD 2024 and 2014 from an Open5e snapshot, lenient Lion's Den XML import with every convention in `DATA-FORMATS.md` §2, search index with filters, 2024-layout stat block with edition switch, homebrew duplicate and edit for monsters.
- Campaign: campaigns with PC cards and quick add, campaign XML import with notes and NPCs, Fight Club GM export import, ordered notes.
- Encounters and combat: builder with the 2024 budget, initiative, turn loop with recharge and legendary pools, conditions, damage math with temp HP and concentration, death saves, attack, multiattack and save calls from stat blocks, spell slot tracker, roll log export.
- Presenter: player window on a chosen display, scene tree, title, image, map and blank-grid scenes, grid alignment, tokens with game-icons art, party placement, player camera, overlays, blackout, break screen.
- Music: local-file player with crossfades, playlists, loudness normalisation, output device selection, scene linking, tag editing, relinking rescans and loop modes.
- Dice roller with a shared pool and log.
- Daily rolling Library backups with restore.
- The stage, dock and live strip console shell.

## [0.1.0] - 2026-09-27

M0 scaffold: two windows, typed IPC, Library folder with atomic writes, CI.
