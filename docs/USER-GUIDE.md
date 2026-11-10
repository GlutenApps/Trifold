# Trifold user guide

Trifold is a desktop console for a Dungeon Master running 5e-compatible games at a physical table: a compendium, campaign notes, an encounter builder and combat tracker, a second-screen "TV" for the players, and a music player. It runs on Windows and macOS, keeps everything on your computer and sends nothing anywhere. Hotkeys are written `Ctrl+…`; on macOS, Ctrl means the Command key and Alt means Option.

## Install and first launch

**Windows.** Download the installer (`Trifold-Setup-<version>-win-x64.exe`) or the portable exe, which runs without installing. Both are unsigned, so SmartScreen shows "Windows protected your PC" the first time: click **More info**, then **Run anyway**. The installer is per-user and needs no administrator rights.

**macOS.** Download the build for your Mac's chip (Intel or Apple silicon). The app is unsigned. On macOS 15 a double-click shows "Not opened": open **System Settings › Privacy & Security**, scroll to the message about Trifold, click **Open Anyway** and confirm. The old right-click › Open no longer works on Sequoia.

**The Library folder.** On first launch Trifold creates `Trifold Library` in your Documents folder. Everything you make lives there as plain JSON and media, so you can zip it, copy it to another machine, or move it with **Settings › Library › Change folder…**. The one file you can ignore is `index.sqlite`, the search index, which is derived from the rest and can be rebuilt at any time.

**The sample campaign.** Every Library starts with *The Lantern at Greyford*, a short adventure for four level-3 characters with notes, NPCs, a ready-made party, encounters, maps and a handout, so you can see how the parts fit together. Open it from **Campaigns** and start with its *Start here* note. Delete it whenever you like; it will not come back on its own. **Settings › Sample campaign** adds it again, or resets it to how it ships (a backup is written first). Its maps are by 2-Minute Tabletop.

## The console at a glance

Trifold has two spaces. The **Library** (the mark at the top left) holds what every campaign shares: Campaigns, Compendium, Music folders and Settings. Opening a campaign enters its **console**; one campaign is open at a time.

- **Top bar.** The mark returns to the Library. The campaign name is a menu: switch campaign, New campaign…, Import campaign XML…, Close campaign. In the middle, **Search** (`Ctrl+F`) finds anything by name: notes and folders, NPCs, party members, encounters (also by who is in them), scenes, compendium records and web tabs, grouped by type. Under **Mentioned in** it also finds what you typed inside your notes, and in the notes on encounters, NPCs, PCs and scenes, with the words around it; opening one takes you to that spot. **Compendium text** finds the phrase inside stat blocks, spells and items. When a group has more than it shows, **Show all** in its header lists just that group in full; Escape (or the back arrow) returns to every result. Arrows move, Enter opens the item where it lives and marks it for a moment, Escape clears. In a narrow window the field is behind a search button. On the right: the current layout, Hotkeys (`Ctrl+/`) and Settings (`Ctrl+,`).
- **Stage.** One or two groups of tabs holding **Campaign**, **Compendium**, **Encounters**, **VTT** (the virtual tabletop: what the TV shows) and any **web tabs**. Each group's `+` opens a tab here and offers **New web tab…**. Drag a tab to move it, or onto the right half of a lone group to split the stage. A closed tab keeps its state.
- **Dock.** The right-hand column for the tall tools, **Scenes**, **Music** and **Quick notes**. Its header toggles each and collapses the dock to icons, where a tool opens as a flyout. **Dice**, **Hotkeys** and **Layouts** are pop-ups from their own buttons.
- **Live strip.** The bottom bar, for table state only: the TV with Blackout and undo, round and turn, music and mute, the dice pool. Every strip button also exists in its tool.

**Layouts.** A layout keeps which tabs are open, where, and the dock. Three starters come with the app: **Prep**, **Table** (VTT beside Campaign, Encounters and Compendium) and **Combat** (Encounters alone on the right). The Layouts pop-up applies, overwrites, renames, reorders and deletes them, saves the screen as a new one, and brings the starters back. `Ctrl+1` to `Ctrl+9` apply the first nine.

**Width.** The window shrinks to 760 px, half of a 1920 px screen. No stage panel is ever narrower than 480 px: when room runs out the dock folds to icons first, then two groups fold into one stack. Widen the window and the saved layout returns.

## Compendium

Trifold ships the System Reference Document, 2024 and 2014 (shown as "legacy"), with attribution on the About card. **Library › Compendium › Sources** lists every source; **Import XML file…** adds a compendium XML file, which stays in your Library. Untick a source to hide its records without removing it; the trash icon removes an imported one.

**Browse** (the console's Compendium tab, or Library › Compendium › Browse) has sub-tabs for Monsters, Spells, Items, Feats, Species, Backgrounds, Classes and Conditions, a search over names and text, and filters for source and edition; monsters add CR range, type, size, environment and a named-NPC filter, spells add level. `Ctrl+K` jumps to the search. Where a record exists in both rulesets, a **2024 / Legacy** switch at the top of the detail flips between them; **Source text** shows the text as imported.

Monster stat blocks use the 2024 layout whatever their edition. Attack and roll badges are clickable: the result goes to the shared roll log and shows at the top of the record. Shift-click rolls with advantage, Ctrl-click with disadvantage.

**Homebrew.** On any monster, **Duplicate to homebrew** makes an editable copy in the Homebrew source; open it and press **Edit** for the editor (name, size, type, CR, AC, HP, abilities and every feature list). **Changes from original** lists what differs. Only monsters have an editor today.

## Campaign

Create a campaign in **Library › Campaigns** (name, **Create campaign**) or import a campaign XML file. Each card has **Open**, an export icon and a delete icon (deleting asks you to type DELETE). The Campaign tab has three sub-tabs.

**Party.** One card per player character with the numbers the tracker needs: HP, AC, initiative bonus, speed, passives, saves. **Quick add** takes one PC per line as `Name, Player, Class L, HP, AC, Init, Speed, PP`. **Import into this campaign…** merges a campaign XML file, including a Fight Club GM export. **Long rest** puts everyone back to full HP and clears temp HP.

**NPCs.** Named NPCs with role, location and notes. A "stat block" badge means it is tied to a compendium record and can fight. An NPC that has fought shows the HP it carried out; the refresh icon (**Restore**) sets it back to full and alive. NPCs come from imports or from **Track as NPC** in the builder and tracker.

**Notes.** A tree of notes and folders on the left, the open note on the right. The toolbar has **New note**, **New folder** and the template menu. Drag rows to reorder, onto a folder to go inside, or below the list for the top level. The editor is formatted text (headings, lists, check lists, quotes, tables, images) stored as markdown; it saves itself half a second after you stop typing and shows Saved or Unsaved beside the title. Removing a folder lifts its contents up a level unless you choose **Remove folder and contents…**. **Find in notes** swaps the tree for phrase hits with snippets; a snippet opens the note at that spot, and Enter or Shift+Enter steps through every hit. Templates are shared by all campaigns: the menu starts a note from one, saves the open note as one, and **Manage templates…** edits them.

**Switching and closing.** Pick another campaign from the top bar menu and the current one closes. If a scene is on the TV or a fight is running, Trifold asks first ("Something is on the TV"): **Keep running**, or **Stop sharing and close**, which blacks out the TV and leaves the fight saved with its encounter for later.

## Encounters and combat

**Building.** **New encounter** opens the builder. Search creatures to add them, or press a party member or NPC in the Party and NPCs lanes. Each row has a quantity, a role (enemy, ally, neutral), a hidden toggle, a label, **Track as NPC** and remove. With PCs in the encounter the builder shows enemy XP, the 2024 difficulty band and the party's low, moderate and high budgets. DM notes typed here show beside the stat block during the fight.

**Placing on a map.** On a map in the VTT tab, **Place encounter…** drops one hidden token per creature and links the encounter to the scene. Drag them into place, reveal them per token or with **Reveal creatures**, then press **Start linked encounter**. **Start combat from tokens** builds a fight from the creature tokens on an unlinked map.

**Starting.** Press **Start combat** in the builder or the play icon on the list. Creatures roll initiative automatically, one roll per group of identical creatures; PCs wait for a number. Type each PC's initiative, or use the dice icon on a row and **Roll remaining**, then **Begin**.

**The turn loop.** `N` is next turn, `P` previous. Clicking a row opens its drawer: a toolbar (mask or reveal the name, hide from players, mark dead, Track as NPC, link to the map, remove) and lanes for HP, conditions, concentration, spell slots and recharges.

**HP.** Type an amount, pick a damage type if it matters, and press **Damage** (or Enter). The heart heals that amount, the shield grants it as temp HP, and the fan-out icon opens the damage pop-up to deal it to several combatants at full or half each. A PC at 0 HP gets a **Death save** button; successes and failures show on the row.

**Conditions.** Pick a condition and a duration: none, rounds, until the start or end of the active turn, or until a save. The book button beside Add opens the picked condition's rules in the Compendium tab. Exhaustion stacks a level each time. A save-ended condition raises a banner at the end of the turn with **Saved, remove it** and **Failed**. Concentration takes a spell name; damage to that combatant raises a banner with the DC and **Failed, drop it** or **Kept it**.

**Attacks and saves from the stat block.** The selected creature's stat block sits beside the list. Click an attack to roll to hit and damage; the damage pop-up lets you tick who takes it, full or half, and press **Apply** (`Ctrl+Enter`). **Roll all** on Multiattack rolls every attack. A save badge rolls the save for every creature in the fight, marks each saved or failed, pre-selects half or full damage, and shows the PCs' bonuses so you can ask the players.

**Mid-fight.** The `+` button or `A` opens **Add to the fight**: party members, NPCs, or a creature search with a count. **Back to list** browses other encounters while the fight runs; **Return to fight** comes back.

**Ending.** **End combat** shows a result card (rounds, XP, fallen PCs) and writes current and temp HP back to each PC card and named NPC, so the next fight starts where this one ended; compendium creatures are always fresh. Conditions do not carry over.

**The map and the fight.** During a fight a combatant's hidden and dead state drives its token on the map in play. Linked tokens wear their turn number; unlinked ones wear a question mark, and the token inspector offers **Link to the fight**. The drawer's **Link to map** does the same from the other side.

**Logs.** The tracker's log is saved with the encounter; every roll also goes to the shared roll log in the Dice pop-up.

## The TV (second screen)

**Settings › Displays** lists attached displays; pick one or leave **Automatic** (the first non-primary display). **Open TV** in the VTT header, the strip, or `Ctrl+Shift+P` opens the player window full screen there, and the button becomes a red **TV on** tally. The player window has no controls of its own.

**Scenes** (dock) is the list. The new-scene row makes a title card, an image scene, a map, a blank grid or a folder; scenes nest in folders, and rows drag to reorder or move. Click selects a scene and shows it in the VTT tab; Enter, double-click or the play icon **sends** it to the TV. **Recent** lists the last scenes sent. **Edit** sets title, subtitle, whether the title shows on the TV, music on go-live, a backdrop for title cards, and DM notes.

**The VTT tab** shows the selected scene, or the live one, and carries every control: a scene picker with previous and next (`Ctrl+Alt+Up`, `Ctrl+Alt+Down`, which select but never send), **Send to TV**, **Blackout** (`Ctrl+Shift+B`, press again to bring the scene back), **Break…** (a title and a countdown; **End break** takes it down), undo (`Ctrl+Shift+Z`) and **Overlays**: scene title, initiative strip, PC health bars and round counter. `Alt+Up`, `Alt+Down`, `Alt+Left` and `Alt+Right` send the next, previous, parent or first child scene straight to the TV.

**Maps.** Drag to pan and wheel to zoom; this is your view, not the players'. The toolbar holds **Grid** (**Align grid to map** asks for two opposite corners of a block of cells; set **Cells across** to 10 or more for a printed grid; plus cell size, colour, opacity and **Show to players**), **Backgrounds** (several images for one map, switched with tokens and grid kept), **Camera** (the dashed box the TV shows: **Fit map**, **Fit tokens**, **Follow active** or **Use my view**), **Player characters** (**Place whole party**, then click the map) and **Creatures** (search and place, or a marker token).

Tokens snap to the grid; hold Alt for free placement; Delete removes the selected one. The inspector sets label, role and size, masks or reveals the name (players see the creature's type until revealed), hides it, marks it dead and sets custom art from an image file. Without art, tokens show a game-icons.net silhouette matched to the creature.

## Music

**Library › Music folders › Add folder…** points Trifold at folders of MP3, OGG, FLAC, WAV or M4A files. Files stay where they are; the refresh icon rescans. A track whose file has gone shows "missing".

**The Music tool** (dock, `Ctrl+M`) opens with the **Audio source** switch, then the transport, then **Tracks** and **Playlists**. Tracks lists title, length, tags, playlists and gain, with a search and a filter by tag; tags are free text. Playlists are filled from each track's **Add to playlist…** and have shuffle, loop, their own crossfade and reorderable tracks.

**Transport.** Previous, play or pause, next, stop (with a fade), loop (off, playlist, track) and **Panic mute** (`Ctrl+Alt+M`), which silences everything Trifold plays until pressed again. Below: seek, Master and Music volumes, the default crossfade, and the **Output** device. Every track is measured once and played at a matched loudness; the Gain column shows the correction. A scene's **Music on go-live** starts its playlist when the scene is sent.

**Phone audio.** Choose **Phone** as the audio source to play from the phone's own apps through this computer; Trifold's player pauses. On Windows 11 the panel lists paired phones with one **Connect** each (Trifold is the Bluetooth receiver); nothing connects on its own. On macOS the panel is a two-step AirPlay Receiver guide for iPhone or iPad. Either way the phone's audio uses the system's default output, so Trifold's Output choice and panic mute do not reach it.

## Dice

On the strip, click a die to add one to the pool (right-click takes one away), then **Roll**; the last total shows beside the chips. The **Dice** pop-up (`Ctrl+D`) adds a modifier, Normal, Adv and Dis (for a single d20), a typed expression (`4d6kh3`, `2d4x10`, `d20+5 adv`) and the **Roll log**: one list for pool, tracker, compendium and save rolls, each with its source, faces and time.

## Web tabs

A web tab is a page you choose, hosted inside the stage. In a group's `+` menu pick **New web tab…**, give it a name (blank follows the page title), an address and an icon. Browsing inside the tab never changes its saved address: Home returns to it, and the edit panel's **Use current page** is the one way to move it. Logins persist between launches. The × parks a tab in the `+` menu; **Remove** forgets it. Zoom is per tab and remembered. Every tab has **Open in system browser**, and modifier hotkeys pressed inside a page still reach the console.

## Backups and moving data

**Settings › Backups.** With **Daily backup** on, Trifold zips the Library into its `backups` folder once a day while open and again on close if anything changed (`<date>-quit.zip`); **Back up now** writes one on demand. A zip holds everything except the search index, logs, earlier backups and music files. **Keep** sets how many days of zips stay.

**Also copy to.** **Choose folder…** names a folder on another drive, or one your cloud sync app keeps; every backup is copied there under `Trifold backups/<Library folder name>/`. The card shows when the last copy was made and the error when the folder cannot be reached. **Stop copying** turns it off.

**Restore.** Each listed zip has a restore icon, and **Restore from file…** takes any zip, including one from your copy folder on a new computer. Restoring **replaces** the Library with the backup rather than merging; a zip of the current state is written first.

**Campaign export.** The export icon on a campaign card opens options inline. **State**: **As it is now** (everything, including a fight in progress) or **Fresh start** (keeps notes, maps, token positions, encounters and NPCs; resets HP, the dead and fights in progress). Tick **Party**, **Homebrew it uses** and **Console layout** as needed, then **Export…** writes `<campaign name>.trifold-campaign`. Imported compendium sources and scene music are never included.

**Campaign import.** **Import campaign…** on the Campaigns page picks a `.trifold-campaign`, shows what it holds and offers **Import**. If the Library already has that campaign, choose **Replace…** (a backup is written first) or **Import as a copy**.

**Logs.** `trifold-<date>.log` in the Library's `logs` folder; before a Library is open, in the app's data folder.

## Quick notes

Press `Ctrl+N` anywhere in the console, or open **Quick notes** in the dock, to write something down without leaving what you are doing. Give it a title (Save stays off until it has one), write as much as you like with the same formatting as any note, then press **Save** or `Ctrl+S`. The cursor goes back where it was. Escape throws the draft away.

Quick notes are ordinary notes kept in a folder called **Quick Notes** in the Campaign tab's Notes. Trifold makes the folder when it is missing, even if you deleted it, and you can rename it. Below the form the tool lists every quick note, newest first, with a find field. Open one to rename, tag, edit or delete it, move it to another folder, or open it in Notes. A note moved out of the Quick Notes folder becomes an ordinary note and leaves the list.

## Hotkeys

Plain letter keys do nothing while you are typing in a field.

| Area | Action | Combo |
|---|---|---|
| Console | Search the campaign and compendium | `Ctrl+F` |
| Console | Quick note: jot something down without leaving your place | `Ctrl+N` |
| Quick notes | Save the quick note | `Ctrl+S` |
| Console | Jump to the compendium search | `Ctrl+K` |
| Console | VTT: the scene on the TV | `Ctrl+T` |
| Console | Music: transport, playlists, tracks | `Ctrl+M` |
| Console | Dice | `Ctrl+D` |
| Console | Hotkey sheet | `Ctrl+/` |
| Console | Settings, in the Library | `Ctrl+,` |
| Console | Maximize or restore the focused stage group | `Ctrl+Shift+M` |
| Console | Apply layout 1 to 9 | `Ctrl+1` to `Ctrl+9` |
| Console | Close the open pop-up or flyout | `Escape` |
| TV | Open or close the TV | `Ctrl+Shift+P` |
| TV | Toggle blackout on the TV | `Ctrl+Shift+B` |
| TV | Undo the last scene change | `Ctrl+Shift+Z` |
| TV | Select the previous or next scene on the TV tab (does not send) | `Ctrl+Alt+Up`, `Ctrl+Alt+Down` |
| TV | Send the previous or next scene | `Alt+Up`, `Alt+Down` |
| TV | Send the parent scene, or the first child scene | `Alt+Left`, `Alt+Right` |
| Combat | Next turn | `N` |
| Combat | Previous turn | `P` |
| Combat | Add to the fight | `A` |
| Combat | Apply the damage in the pop-up | `Ctrl+Enter` |
| Music | Play or pause music | `Ctrl+Alt+P` |
| Music | Previous or next track | `Ctrl+Alt+Left`, `Ctrl+Alt+Right` |
| Music | Cycle music loop: off, playlist, track | `Ctrl+Alt+L` |
| Music | Panic mute all audio | `Ctrl+Alt+M` |
| Web tab | Zoom the web tab in | `Ctrl+=` or `Ctrl+Shift++` |
| Web tab | Zoom the web tab out | `Ctrl+-` |
| Web tab | Reset the web tab zoom | `Ctrl+0` |

The scene-sending combos work while the Scenes tool is open; `A` and `Ctrl+Enter` while the tracker is on screen. The Hotkeys button in the top bar shows the same list.

## Troubleshooting

**"No bundled content in this build"** on the About card means the build was made without the SRD snapshot. Searches stay empty until you import a compendium XML file.

**The TV opened on the wrong display.** Close it, pick the right display in **Settings › Displays** (**Refresh displays** if it is missing) and open it again.

**No sound, or the wrong speakers.** Check the strip is not showing **Muted**, then the **Output** menu on the Music transport. Phone audio ignores that menu and uses the system's default output.

**Search returns nothing, or the index says unavailable.** Settings › Library shows the index status. **Rebuild index** is in **Library › Compendium › Sources**; it re-reads every file in the Library and loses nothing.

**You need details on an error.** **Settings › Library › Open folder**, then read the newest file in `logs`.

Further reading: [DESIGN.md](DESIGN.md), [DATA-FORMATS.md](DATA-FORMATS.md) and the decision records in [adr/](adr/).
