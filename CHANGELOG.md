# Changelog

All notable changes to Trifold. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Dates are ISO.

## [Unreleased]

### Added

- **CR scaler** (ADR 0038): **Scale to another CR**, at the top of the monster editor's Challenge section, moves hit points, armor class, attack bonuses, save DCs, damage, saving throws and skills by how much a typical monster changes between the two CRs, keeping dice sizes; offers an attack more or fewer at big jumps; shows every change before you apply it. The name stays; a **Scaled CR** tag marks it.
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

- Where something lives is now *This campaign* or *All campaigns* everywhere: the Save step, **Use in all campaigns** (was Add to my compendium), and campaign creatures' source pill. **Open in compendium** under an NPC's stat block is now **Open stat block**.

### Fixed

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
