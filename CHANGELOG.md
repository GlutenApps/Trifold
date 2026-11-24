# Changelog

All notable changes to Trifold. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Dates are ISO.

## [Unreleased]

### Changed

- **Trifold opens on Library › Campaigns** every time, rather than in the campaign open when it last closed. Opening the campaign brings its console back as you left it.

### Fixed

- **Trifold no longer gets stuck on the loading screen.** If the console's window cannot draw, it now shows the window anyway, or a page that says it stopped and where the log is, instead of leaving the loading screen up. Closing the loading screen quits Trifold rather than leaving it running in the background, and opening Trifold again while it runs brings its window forward. A console that stops is reloaded once, and what went wrong is written to the log.

## [0.5.0-beta.2] - 2026-11-24

Fixes from the first table test of player mode, and a way to set up a character when you sit down.

### Added

- **Your sheet for …** (ADR 0078): pick a PC with no sheet and the VTT tab asks for one above the map: use a character from your Library (one named like the PC first), **Build one**, **Import from PDF**, or **Not now**. Holding nothing, **Bringing a new character?** under the list does the same before you ask your GM to add it, and the Sheets tab offers the same choices.
- **Read a player's sheet** (ADR 0078): a linked player's sheet is shared with the GM's Trifold and kept on their PC card. **Read <name>'s sheet** on the Party tab opens it read-only, kept up to date as the player changes it. Private notes stay with the player.

### Fixed

- **Cancel and Move here** in the player console's Move banner can be clicked; they could not.

## [0.5.0-beta.1] - 2026-11-24

Player mode: players run Trifold on their own computer and join the GM's table on the local network, with their own characters. A pre-release for table testing.

### Added

- **First-run choice**: a new Library asks **Game master** or **Player**. A game master's gets the sample campaign; a player's opens on **Join a campaign**. Settings › Appearance › **How you use Trifold** changes it later. Libraries already in use are not asked.
- **Join a campaign** (Library › Campaigns): tables on this network are listed by campaign name, or type the address the GM's Trifold shows. Joined campaigns sit under **Playing**, beside your own under **Running**.
- **The player console**: the live map with your token, your characters and the initiative order, **Your turn** and **You're next**, quick notes, dice (table rolls go to the GM's roll log; private ones go nowhere) and the compendium. Opening a joined campaign while the table is down shows the last map until it comes back.
- **Characters** (Library › Characters): a sheet kept in another app, a sheet imported from a PDF (**Import from PDF**), or a Trifold sheet made with the guided builder, under the 2024 rules or the legacy 2014 rules. Trifold sheets work out their numbers, roll from the page, track resources with short and long rests, level up, and keep stat blocks for wild shapes and companions.
- **Sharing with players**: a campaign shares books and collections with its players, who get the spells and items but never the creatures. **Player packs** carry a campaign to players before the first session. A player's level-up reaches the GM as a sheet offer to accept or dismiss.
- **Version check**: a player's Trifold that can't talk to the GM's says which one needs an update.

### Changed

- **Sources** are organised by book: filter, star, delete and share books, and settle duplicate records one at a time.
- A panel that fails to draw shows an error in that panel instead of blanking the window.

## [0.4.6] - 2026-11-21

Table-testing fixes for 0.4.5, HP and conditions between fights, and a new licence: Trifold is now free software under the GNU GPL.

### Added

- **HP and conditions between fights** (ADR 0055): each PC, and each NPC with a stat block, shows its HP and conditions on a second line in the Campaign tab. Press the HP to change it without a fight: **Damage** (temp HP first), **Heal**, **Temp HP** or **Set**; Enter is Damage, Shift+Enter is Heal. A **+** opens the list of conditions. Story NPCs without a stat block show none, and the condition dropdown that sat on every row is gone.
- **Area shapes from a creature** (ADR 0050): start a shape on a token and it comes from that creature. A sphere becomes an **emanation** around the creature's space; a cone, cube or line starts at the edge of its space, facing where you drag. The ruler and fog tools work over tokens too.
- **Open-source libraries** in Settings › About lists the licence of every library Trifold includes, and installs carry the same file in their licenses folder.

### Changed

- **Licence** (ADR 0056): Trifold is now free software under the GNU General Public License, version 3 or later, copyright © 2026 Ian duPont. The installer and Settings › About show the notice and the full text. Versions 0.3.0 to 0.4.5 stay under the MIT License. The name and logo are reserved ([TRADEMARK.md](TRADEMARK.md)), and contributors sign a CLA ([CONTRIBUTING.md](CONTRIBUTING.md)).
- **Settings** (ADR 0054): each section is a card across the page with its icon and title in a header, every setting has one short line on what it does, and the jump links are gone.
- **Edit on an encounter creature** (ADR 0035): a creature you made (homebrew or this campaign's) opens as it is, so Save updates it; a pre-made one opens as a copy named after the creature ("Goblin"), never "Copy of Goblin".

### Fixed

- **A cube's or line's origin dot** sits in the middle of the face it grows from, not on a corner.

## [0.4.5] - 2026-11-21

Scaled creatures and hordes that fight like their CR, an attack button for every SRD creature, updates that take seconds and show their progress, and a reorganised Settings page.

### Added

- **Tune mode in the CR scaler** (ADR 0051): beside **Quick**, **Tune** lets you move hit points, damage, attack count, legendary actions and an area attack one step at a time. The challenge rating shown is what they add up to, and nothing else moves unless you press **Balance**, which brings the CR back to the one you picked.
- **Scaling up adds what big monsters have** (ADR 0051): scaled to CR 11 or higher, a creature gains legendary actions (and, from CR 16, Legendary Resistance) and an area attack, sharing its damage budget rather than adding to it.
- **Swarm bites** (ADR 0052): in a horde, a creature whose attack averages 2 damage or less (a Rat's 1) bites for 1d4 per member, so a horde of rats is a real threat at 20 or more.
- **An Impossible band** on the difficulty bar, from twice the High budget.
- **Text size** in Settings › Appearance zooms the console from Small to Extra large on this computer; the TV is never zoomed.
- **Identify** in Settings › Table display shows each screen's number on it, and screens are named by number (and the monitor's name) instead of an internal id.
- **Recent Libraries** in Settings › Library reopens a Library used before in one click.
- **Open logs folder** and **Copy version info**, for bug reports.

### Changed

- **The CR scaler fights true** (ADR 0051): tested by simulated fights against every SRD monster, scaled creatures now land within one CR step of real monsters three times in four (about half before). Creatures below CR 1 scale from SRD values, flat damage scales, quick scale changes the number of attacks, odd stats move toward typical on big jumps, and legendary actions are dropped below CR 10.
- **Hordes** (ADR 0052, replacing ADR 0047's CR rule):
  - A horde's CR now matches how it fights, up to 50 members, and the encounter budget counts that CR's XP. Ten bandits show CR 3, fifty show CR 11.
  - A horde attacks once for every three members standing, each roll going to the damage queue on its own, so ten or more no longer one-shot a PC.
  - One hit fells at most three members; an area effect such as a Fireball hurts each member caught, which you enter as **Members in the area** when you apply the damage.
  - A horde of CR 3 or stronger creatures warns that it hits very hard.
- **Settings, reorganised** (ADR 0054): one column of sections in the order you reach for them (Table display, Appearance, Backups, Updates, Library, Troubleshooting, About), each setting with a line on what it does, and links at the top to jump between them.

### Fixed

- **Every SRD 2024 creature with an attack has its attack button.** 33 creatures, the Rat, Bat, Cat, Mimic and Bugbear Warrior among them, had none, because their stat blocks leave out "Hit:" or add a note after the bonus. About 260 more now take their damage and damage types from the stat block itself, fixing wrong dice (the Adult Bronze Dragon's lightning, the Baboon's bite) and damage types that resistances need. Imported XML compendiums show **parser updated** in Compendium › Sources, so you can re-read them.
- **Restart now shows the update** (ADR 0053): a small "Updating Trifold" window shows the installer's progress until Trifold opens again, instead of nothing.
- **Updates take seconds, not minutes** (ADR 0053): the game-icons ship as one file instead of 4,176, so Windows has far fewer files to check. An update went from about 8 minutes to about 30 seconds on a test machine.
- **Settings saves finish before Trifold quits**: closing could cut off the save of the window position and leave a `config.json.*.tmp` file behind, and two settings changes at once could lose one of them. Old leftover temp files are removed at startup.

## [0.4.4] - 2026-11-20

The rest of the table-testing list: conditions that last between fights, a measuring tool on phones, and area shapes on the map.

### Added

- **Conditions between fights** (ADR 0049): PCs, NPCs and companions keep their conditions all the time. Players change them from their phones in or out of a fight, and each PC and NPC row in the Campaign tab shows them, with **+ Condition** and a remove button. They go into a fight and come back out like HP, without their durations.
- **Measure on the phone**: the phone's Move tool has **Move | Measure**. In Measure, a drag on the map shows the distance (*3 squares · 15 ft*) on that phone only; the TV and your map never see it.
- **Area shapes** (ADR 0050): **Area shapes** in the map toolbar (`S`) draws a cone, sphere, cube or line at the size you set in feet, from the nearest grid corner, aimed by dragging. The squares at least half inside are shaded. It's only a picture and selects nothing. The TV and phones show it too, under the fog.

### Changed

- **Long rest** also lowers Exhaustion by one level.
- **Companions that stay after a fight** keep their HP from it, as well as their conditions.

### Fixed

- **Two settings changes made at once no longer lose one of them.** This could undo a setting such as the TV's display when the console saved its layout at the same moment.

## [0.4.3] - 2026-11-20

Table-testing feedback: one switch for the TV and phones, phones that show everything the TV does, hordes, and fixes.

**What's different at the table.** **Open TV** is now **Go live** (`Ctrl+Shift+P`), and **Send to TV** is now **Set active scene** (Enter, double-click or ▶ in Scenes still do it). Nothing reaches the TV or the phones until you go live. You can set the opening scene first and go live when everyone is seated. Copies of a creature now roll their own initiative.

### Added

- **Go live** (ADR 0046): one switch for the TV and the phones. When you go live, the TV opens by itself on a second monitor; with only one monitor, no TV window opens and phones still see the table. Choose a display in Settings › Displays to always open the TV there, your own screen included. A monitor plugged in while you are live gets the TV. **End live** closes the TV and the phones wait.
- **Set active scene** and **Clear active scene** replace Send to TV and Take off TV. A scene set before going live is marked **active** and waits; its music starts when it goes on air. The strip says "Not live · Next: …" until you go live.
- **Phones show the TV's overlays**: the scene title, the round and the initiative strip along the top, and the timer and counters in the corner, each while its Overlays switch is on.
- **Hordes** (ADR 0047): **Horde** (the party icon) on an encounter row of two or more compendium creatures makes them one combatant with one token, one turn and their hit points pooled. The row shows the CR their XP adds up to (four CR 1/8 bandits make a CR 1/2 horde); the encounter's difficulty stays the same. The tracker shows how many still stand, and each attack rolls its damage once per member standing, so a hurt horde hits softer.
- **Scene music can be a single track**: Music on go-live lists playlists and tracks, with a **Loop** switch. A playlist starts with its own loop setting, and the scene's switch applies to that scene only.
- **Phones show "Loading map…"** while a new map is on its way, and try again if it fails to load.

### Changed

- **Every creature rolls its own initiative**: copies of a creature no longer share one roll, and the per-group setting is gone. Make them a horde to have them act as one.
- **The CR scaler's CR follows what's ticked** (ADR 0048): every part starts ticked, the extra attack too, and each attack is its own roll carrying its share of the damage. Untick anything and the CR the monster ends at drops to match; the Challenge line says which CR everything ticked would reach.
- **Global search is faster**: about a third quicker per keystroke on large campaigns.

### Fixed

- **Switching a scene's background now reaches phones**; they kept showing the old picture.
- **The Compendium's kind tabs fold into More** in a narrow panel again; inside a campaign they scrolled sideways instead.
- **Phones follow End live at once** instead of waiting for the next change on the table.

## [0.4.2] - 2026-11-19

The final brand, and updates that install themselves on Windows. This is the last version to install by hand: from here, an installed Windows copy with the update check on fetches each new version itself.

### Added

- **Loading splash**: when Trifold takes more than a moment to open, a small window shows the turning mark and what it is doing ("Opening your Library…") until the console is ready. Quick launches never show it.
- **Updates install themselves on Windows** (ADR 0045): with the update check on, the installed Windows build downloads a new version in the background, shows its progress in Settings › Updates, and offers **Restart to update**. Nothing installs until you press **Restart now**, which saves, makes the on-close backup, installs and reopens Trifold. Every update's manifest must carry the project's signature or it is refused. The portable exe and macOS still open the release page.

### Changed

- **Final brand**: a rust hexagon inside a three-part frame replaces the sword mark everywhere: app and installer icons, the DMG background, the top bar, the About card and the README banner. Small Windows icons sit on a dark tile so the mark stays visible on a light taskbar.
- **Softer accent**: the dark theme's bone accent (primary buttons, focus, the current turn) is now a darker version of the logo's cream instead of a yellow sand, so the app and the logo share one warm grey. Amber stays the warning colour.
- **The update check runs at every launch** (and daily while Trifold stays open) instead of at most once a day, and a check that fails while offline is tried again after a few minutes.

### Fixed

- **The update check finds a release published without its tag**: it reads the version from the release title when GitHub reports a placeholder tag, so 0.4.0 no longer said it was up to date when 0.4.1 was out.

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
