# Trifold user guide

Trifold is a desktop console for a Dungeon Master running 5e-compatible games at a physical table. It brings together a compendium, campaign notes, an encounter builder and combat tracker, a second screen (the "TV") for the players, a page players can follow on their phones, and a music player. It runs on Windows and macOS and keeps everything on your computer.

This guide walks through installing Trifold, each of its tools in the order you are likely to meet them, the hotkeys, backups, and what to do when something goes wrong. Hotkeys are written `Ctrl+…` throughout; on macOS, Ctrl means the Command key and Alt means Option.

## Install and first launch

**Windows.** Download the installer (`Trifold-Setup-<version>-win-x64.exe`) or the portable exe (`Trifold-Portable-<version>-win-x64.exe`), which runs without installing. Both are unsigned, so the first time SmartScreen shows "Windows protected your PC": click **More info**, then **Run anyway**. The installer is per-user and needs no administrator rights.

**macOS.** Download the build for your Mac's chip (Intel or Apple silicon). The app is unsigned. On macOS 15 a double-click shows "Not opened": open **System Settings › Privacy & Security**, scroll to the message about Trifold, click **Open Anyway** and confirm. Right-click › Open does not get past this on macOS 15.

**Your Library.** On first launch Trifold creates a `Trifold Library` folder in your Documents folder. Everything you make lives there as plain files and pictures, so you can zip it, copy it to another computer, or move it with **Settings › Library › Open another Library…**. The one file you can ignore is `index.sqlite`, the search index, which Trifold builds from everything else and can rebuild at any time.

**The sample campaign.** Every Library starts with *The Lantern at Greyford*, a short adventure for four level-3 characters with notes, NPCs, a ready-made party, encounters, maps and a handout, so you can see how the parts fit together. Open it from **Campaigns** and start with its *Start here* note. Delete it whenever you like; it does not come back on its own. **Settings › Sample campaign** adds it again, or resets it to how it ships (a backup is written first). Its maps are by 2-Minute Tabletop.

## The console at a glance

Trifold has two spaces. The **Library** (the mark at the top left) holds what every campaign shares: Campaigns, Compendium, Images, Music folders and Settings. Opening a campaign enters its **console**. One campaign is open at a time.

**Top bar.** The mark returns to the Library. The campaign name is a menu: switch campaign, **New campaign…**, **Import Game Master XML…** and **Close campaign**. In the middle, **Search** (`Ctrl+F`) finds anything by name: notes and folders, NPCs, party members, encounters (also by who is in them), scenes, compendium records and web tabs, grouped by type. Under **Mentioned in** it also finds words you typed inside notes, and inside the notes on encounters, NPCs, PCs and scenes, with the text around them; opening one takes you to that spot. **Compendium text** finds a phrase inside stat blocks, spells and items. When a group has more than it shows, **Show all** in its header lists that group in full, and Escape (or the back arrow) returns to every result. The arrow keys move through results, Enter opens the item where it lives and highlights it for a moment, and Escape clears. In a narrow window the field sits behind a search button. On the right are the current layout, Hotkeys (`Ctrl+/`) and Settings (`Ctrl+,`).

**Stage.** One or two groups of tabs holding **Campaign**, **Compendium**, **Encounters**, **VTT** (the virtual tabletop: what the TV shows) and any **web tabs**. Each group's `+` opens a tab there and offers **New web tab…**. Drag a tab to move it, or onto the right half of a lone group to split the stage. A closed tab keeps its state.

**Dock.** The right-hand column holds the tall tools: **Scenes**, **Music**, **Quick notes**, **Counters** and **Timers**. Its header shows or hides each one and collapses the dock to icons, where a tool opens as a flyout. **Dice**, **Hotkeys** and **Layouts** are pop-ups from their own buttons.

**Live strip (the tray).** The bottom bar is for table state only: the TV with Blackout and undo, round and turn, music and mute, and the dice pool. Every strip button also exists in its own tool. The checklist button just left of Dice chooses what the strip shows: any four of VTT, Music, Encounters, single counters (the value with − and +) and single timers (time left, Start/Pause and Reset), always in that order. Dice is always there. While a break screen is up, the VTT section reads **Break** with its countdown, in red. The strip's choice is part of the layout, so saved layouts carry it; a layout made in another campaign brings its VTT, Music and Encounters choices but not that campaign's counters and timers. In the Library the strip is fixed to VTT, Music and Dice, and clicking VTT or Music goes back to the console.

**Layouts.** A layout remembers which tabs are open, where, and how the dock is set. Three starters come with the app: **Prep**, **Table** (VTT beside Campaign, Encounters and Compendium) and **Combat** (Encounters alone on the right). The Layouts pop-up applies, overwrites, renames, reorders and deletes layouts, saves the current screen as a new one, and brings the starters back. `Ctrl+1` to `Ctrl+9` apply the first nine. `Ctrl+Shift+M` maximizes the focused stage group, and pressing it again restores it.

**Width.** The window shrinks to 760 px, half of a 1920 px screen. No stage panel is ever narrower than 480 px: when room runs out the dock folds to icons first, then two groups fold into one stack. Widen the window and the saved layout returns.

## Compendium

Trifold ships the System Reference Document in both its 2024 and 2014 versions (the 2014 one is shown as "legacy"), with attribution in Settings › About.

**Browsing.** The compendium (the console's Compendium tab, or **Library › Compendium**) has sub-tabs for Monsters, Spells, Conditions, Rules, Items, Classes, Feats, Species and Backgrounds, in the order you reach for them at the table. In a narrow panel the last ones fold into **More**. **Rules** holds the SRD's rules chapters, one entry per rule with its section and formatted text, tables included. Each kind has a search over names and text and filters for source and edition; monsters add CR range, type, size, environment and a **Named** filter (stat blocks a book marks as a named character), and spells add level. `Ctrl+K` jumps to the search. Each row shows one pill: the source its version comes from ("SRD 5.2", or "· legacy" for 2014 rules), plus a **+** when the record is in other sources or editions too; hover the + to see which. An open record has a dropdown at the top listing every version by edition and source, highest priority first, to switch between them. A monster that a campaign NPC uses as its stat block lists those NPCs at the end under **Used by**; click one to open it in its own campaign.

**Rolling from a stat block.** Monster stat blocks use the 2024 layout whatever their edition, and nearly every number in them rolls. Click an attack, bonus action or reaction to roll it, or the creature's own rolls: the Mod and Save columns of the ability table, each skill, its initiative and its hit dice. Shift-click rolls with advantage and Ctrl-click with disadvantage. The result shows at the top of the record and goes to the roll log in the Dice pop-up.

**Sources.** **Library › Compendium › Sources** has two tabs. **Import Game Master XML…** adds a compendium XML file in the format the Game Master and Fight Club apps use, and keeps it in your Library.

**Books** lists every book in your imported files, one row each, whether a file holds one book or a hundred; the same book in two files is one row. Search by name, or show only starred books, books that are on or off, a tag such as Third Party, or one file. Tick books to act on many at once: **Star**, **Unstar**, **Turn on**, **Turn off**, or mark them as 2024 or legacy **Rules**. Each row also has its own star and on switch. When the same record is in more than one place, your homebrew is shown first, then a starred book's copy, then the rest, with the SRD last; the other copies are still on the record. To settle one record yourself, open it and press **Always use this copy** (the pin), which beats homebrew and stars for that record only; press it again to go back. A book that is off leaves the compendium and search until you turn it on. **Browse** on a row opens the compendium showing only that book's records, across every kind, until you close the **Book** chip above the filters. A line at the top says when something needs a look: a file that can be re-parsed, import warnings, or a book in more than one file.

**Collections** sit above the book list: named groups of books such as Core rules or a setting's books. Type a name and press **New collection**, then tick books and use **Add to…**. Click a collection's name to show only its books, and **Remove from** takes the ticked books out of it. A collection's pencil opens its name and two lists of campaigns. **Used by:** while a ticked campaign is open, its compendium shows only the books in the collections it uses; your homebrew, the SRD and the campaign's own creatures always show, and a campaign that uses no collection shows every book. **Shared with players:** players in a ticked campaign get those books' spells, items, feats, species, backgrounds, classes, conditions and rules at the table. A campaign's **Shared sources** tab can share collections too, and says which collections the campaign uses. Deleting a collection keeps its books and stops every campaign sharing it.

**Duplicates** lists the records that are in more than one file or book and whose copies disagree: different numbers (such as CR or HP) or different rules text, in the same edition. Each row says how the copies differ, which copy is shown and why, and lets you pick a copy or **Automatic**. Reprints of the same record are hidden; choose **Every duplicate, reprints too** to see them. Search by name, or show one kind, only the records you settled, or only those left to the order. Your choices stay through Re-parse.

**Files** lists what you imported and what ships with Trifold. Untick a file to hide its records without removing it, and use the trash icon to remove an imported one. A warning icon on a row shows what the import could not read. When Trifold's reader has improved since you imported a file, the row says **parser updated** and a refresh icon reads the file again; a file that came in with a Game Master campaign keeps no copy to read again, so it is never marked.

An imported file's row also says which campaigns show it and which campaigns share it with their players. Its pencil opens **Edit source**, with three parts: **Books**, the books the file names, with how many records each has; **Shows in**, **Every campaign** or **Only these campaigns**; and **Shared with players**, the campaigns whose players get its spells, items, feats, species, backgrounds, classes, conditions and rules at the table (never its creatures). The same sharing can be set from a campaign's **Shared sources** tab; this is the place to change it for every campaign at once. The Homebrew row says how many records each campaign shares. The stat blocks a Game Master campaign file brings in start as that campaign's only, so one adventure's characters stay out of your other campaigns. With no campaign open, every source shows.

Some compendium files mix books written for 2014 rules with 2024 ones without marking the newer records, so the same monster can appear twice with nothing to say which copy is which. When an imported file has that problem, its row says so (for example "14 monsters and 3 spells appear twice in this file") with an **Edit source…** button: under **Books**, tick the books that use 2024 rules and **Apply**, and those records are labelled 2024 rules straight away.

**Editing.** Every record has **Edit**. On an SRD or imported record it edits a copy, since those never change; on your own record it edits that record. You can also edit a creature from its row in the encounter builder, or a fighter during a fight, and the editor opens right there. Nothing is written until you press **Save** and then **Confirm**. Save asks only what applies:

- the **name** (a creature kept in your compendium can't share a name with one already there, and Trifold suggests a free one);
- **Keep it**: *This campaign only* (offered while a campaign is open) or *All campaigns*, kept in your homebrew; for one of your own, *Update it* or *Save as new*;
- **Use it**: just this fighter or row, every one in this fight or encounter, or every one in the campaign, each offered only when there is one.

**Back** returns to the form. In **Library › Compendium**, **New homebrew** opens a small panel (close it with × or Escape) where you pick a kind, then **Start a blank** one or find an existing record by name to edit a copy of. Each kind has its own editor, laid out in titled sections with Cancel and Save kept at the top while you scroll.

Your own record shows **Edit**, **Changes from original** (what differs from the record it was copied from) and the trash icon to delete it. A campaign's own creature (its source pill says **This campaign**) also has **Use in all campaigns**, which copies it into your homebrew. When the open campaign uses the original somewhere, a copy's page offers **Replace <original> in this campaign…**, which shows what will change and then swaps the copy into every encounter row, fight and map token that uses the original (labels and HP overrides stay); **Put <original> back in this campaign…** undoes it. Pick **Homebrew** in the Source filter to see only your homebrew.

**Scaling a monster to another CR.** In a monster's editor, **Scale to another CR** at the top of the Challenge section moves the whole stat block to a new CR. Step with **−** and **+** or pick the CR, and each change shows as old → new: hit points, armor class, attack bonuses, save DCs, damage, saving throws and skills. Damage keeps its dice size and gains or loses dice, and at a jump of 4 CR or more an attack is added (or taken away), each attack its own roll carrying its share of the damage. Everything starts ticked; untick any part you want to keep as it is, and the CR the monster ends at drops to match (the Challenge line says which CR everything ticked would reach). **Apply CR … to the form**, then Save as usual (**Keep CR …** or Escape backs out). The name stays the same, so nothing changes on the TV, and the stat block shows a tag such as **Scaled CR 1 → 5**.

## Campaigns

**Library › Campaigns** lists your campaigns. Each card has **Open**, an export icon and a delete icon (deleting asks you to type DELETE). **Create campaign** offers three ways in: **New blank campaign** (type a name, then **Create**), **Import a Trifold campaign** (a `.trifold-campaign` file) and **Import from Game Master** (a campaign XML file exported from the Game Master app; the **?** beside it explains what that is). While you are in the Library, the top bar's search (`Ctrl+F`) looks through every campaign; each result says which campaign it is in, and opening one opens that campaign at that spot.

Inside a campaign, the Campaign tab has five sub-tabs: Party, NPCs, Companions, Notes and Sessions.

### Party

One card per player character with the numbers the tracker needs: HP, AC, initiative bonus, speed, passives and saves. **Add PC** (the plus) opens a menu. **Start blank** asks only for a name, Max HP and AC up front; Basics, Senses, Combat and Notes are optional sections you can open now or fill in later. **Save and add another** saves the card and gives you a blank one, the quick way to enter a whole party. **Import from another campaign…** copies a PC from any other campaign in your Library; the copy starts at full HP and is independent of the original. **Import Game Master XML…** merges a Game Master campaign XML file, or a Fight Club GM export, into this campaign. Under each PC's name is its status between fights: its **HP** and its conditions. Press the HP to change it without a fight: type an amount and choose **Damage** (temp HP goes first), **Heal**, **Temp HP** or **Set**; Enter is Damage and Shift+Enter is Heal, and Escape closes it. The **+** after the conditions opens the list to add one (Exhaustion goes up a level each time), and each condition has a remove button. Players change the same HP and conditions from their phones, and a fight starts with them and hands them back when it ends (conditions without their durations). **Long rest** puts everyone back to full HP, clears temp HP and lowers Exhaustion by one level.

### NPCs

Named NPCs with role, location and notes. An NPC with a stat block (so it can fight) shows where that stat block lives as a short pill on its row: *This campaign*, *Homebrew* (all campaigns), or the book or file it came from. The book icon shows the stat block under the row, with **Open in compendium**. An NPC with a stat block also shows its status: **HP full** until it is hurt, then the HP it carries, which you change the same way as a PC's, and its conditions with the same **+**. A story NPC without a stat block shows none. The refresh icon (**Restore**) sets a hurt NPC back to full and alive.

**Add NPC** (the plus) opens the same kind of menu as Add PC. **Start blank** needs only a name; role, location, a stat block and notes are optional. **Import from another campaign…** copies an NPC alive and at full HP, bringing along a stat block that only that campaign could see. **Copy from the compendium…** turns any creature into a named NPC: tick **Named characters only** to see just the named ones, and the list loads more as you scroll. The creature gets its own copy of the stat block in this campaign, so you can change it without touching the original, and its form opens next for a name, role and notes; **Cancel** there takes the add back and returns you to the search. NPCs also come from imports and from **Track as NPC** in the encounter builder and tracker.

The pencil edits an NPC and its stat block together: the NPC's fields come first, then the stat block's sections (its name labelled **Stat block name**, since the NPC can fight as a creature with another name), with **Scale to another CR** at the top of Challenge. One Save keeps both. A note says where a stat block change goes: a stat block only this NPC uses is updated in place; one from the SRD, a file, your homebrew, or shared with another NPC is copied into this campaign for this NPC, and the original stays as it is. If the hit points change, the NPC's carried HP keeps the same share of damage, and encounters it is in show its new CR and XP. An NPC whose **Companion of** names a PC goes with that PC to the player's phone (see [Players on their phones](#players-on-their-phones)).

The trash icon deletes an NPC and takes it out of this campaign's encounters, fights and maps; the confirmation says where it is used first. A stat block kept in this campaign only is deleted with it, unless another NPC here uses it; one from the SRD, a file or your homebrew stays.

### Companions

The creatures players can bring into play from their phones: summoned spirits, familiars, steeds, a ranger's beast. Search the compendium here to add one, press **New companion** to make one from scratch (a spiritual weapon, a homebrew familiar), or press Edit on one to customise it; a compendium creature gets this campaign's own copy, so the original never changes. **Available as a companion** (the figure with a spark) on a creature's compendium page adds it to the list too. How players use the list is under [Players on their phones](#players-on-their-phones).

### Notes

A tree of notes and folders on the left, the open note on the right. The toolbar has **New note**, **New folder** and the template menu. Drag rows to reorder them, onto a folder to go inside it, or below the list for the top level. The editor is formatted text (headings, lists, check lists, quotes, tables, images); it saves itself half a second after you stop typing and shows Saved or Unsaved beside the title. Removing a folder lifts its contents up a level unless you choose **Remove folder and contents…**. **Find in notes** swaps the tree for phrase hits with snippets; a snippet opens the note at that spot, and Enter or Shift+Enter steps through every hit. Templates are shared by all campaigns: the menu starts a note from one, saves the open note as one, and **Manage templates…** edits them.

### Sessions

The session log keeps itself. The first fight that ends, scene you send to the TV or NPC that dies starts a session, and everything after joins it until play stops for six hours, so a game that runs past midnight stays one session. Sessions are listed newest first under the campaign's XP so far (in total and per PC). The newest is open: its fights (XP, XP per PC, rounds, who fell), the scenes shown and who died, a **Title** (left empty it reads *Session 3* and so on) and a **Recap** you write like a note, saved as you type. Older sessions fold to one line; click one to open it. The **+** starts a session now, for a recap written before anything happens. The trash icon deletes a session after asking; the encounters keep their own results.

### Switching and closing

Pick another campaign from the top bar menu and the current one closes. If a scene is on the TV or a fight is running, Trifold asks first ("Something is on the TV"): **Keep running**, or **Stop sharing and close**, which blacks out the TV and leaves the fight saved with its encounter for later.

## Encounters and combat

### Building an encounter

**New encounter** opens the builder. Search for creatures to add them, or press a party member or NPC in the Party and NPCs lanes. Each row has a quantity, a role (enemy, ally or neutral), a hidden toggle, a label, **Edit** (on a creature), **Track as NPC** and remove. A compendium creature with a quantity above 1 also has **Horde** (the party icon): instead of individuals, each with its own token, turn and initiative, a horde fights as one combatant with one token, one turn and its members' hit points pooled. Its row shows the CR the horde fights like, and the encounter's difficulty counts that CR's XP: bigger members climb faster, so four CR 1/8 bandits make a CR 1 horde, twelve CR 1/2 creatures a CR 6 and fifty bandits a CR 11. Hordes suit weaker creatures; a horde of CR 3 or higher creatures says so on its row, since it hits very hard. In the tracker a horde shows how many members still stand. Rolling one of its attacks rolls once for every three members standing, each roll with its members' damage (eight standing make rolls for 3, 3 and 2), so a hurt horde hits softer. When you assign damage to a horde, **Members in the area** asks how many members an area effect such as a Fireball catches: each takes the damage, up to one member's hit points. Leave it at 1 for a single hit, which fells at most three members however hard it lands, so a sword stroke kills three rats, not nine. Tiny creatures bite as a swarm in a horde: an attack of 2 damage or less (a Rat's 1) rolls 1d4 for each member. Creatures that share a name are numbered across the encounter (Goblin 1, Goblin 2), and the numbers follow them into the tracker and onto their tokens. **Edit** on a creature's row opens its stat block right there as a copy, named after its label and with its HP override; change anything, and Save asks where to keep it and where to use it (see Editing in the Compendium section). DM notes typed in the builder show beside the stat block during the fight.

Once PCs are in the encounter, a row at the top of the builder shows the 2024 difficulty band (Trivial, Low, Moderate or High, or Impossible from twice the High budget), the enemies' XP and XP per PC, and a meter with the party's low, moderate and high budgets and the Impossible line marked (hover it for the numbers). **Scale** beside it lists every compendium creature in the encounter with a CR picker; **All −** and **+** step them all at once, and the band and meter follow as you pick. **Apply** moves each stat block to its new CR, the same way the editor's scaler does, and keeps it in this campaign under the same name, so the players see no change; the stat block shows a **Scaled CR** tag. Scaling back to the original CR returns the row to the original creature. Named NPCs are scaled from their own stat block.

**Placing on a map.** On a map in the VTT tab, **Place encounter…** drops one hidden token per creature and links the encounter to the scene. Drag them into place, reveal them per token or with **Reveal creatures**, then press **Start linked encounter**. **Start combat from tokens** builds a fight from the creature tokens on an unlinked map.

### Running a fight

**Starting.** Press **Start combat** in the builder or the play icon on the encounter list. Started from a map, the fight includes the PCs standing on it (plus any the encounter names), so a split party fights apart; started from the Encounters tab, it includes the PCs the encounter names; if either leaves nobody, the whole party joins. Remove anyone at the Set initiative step, or add them with **Add to fight**. Creatures roll initiative automatically, each its own, while PCs wait for a number. Type each PC's initiative, or use the dice icon on a row and **Roll remaining**, then **Begin**.

**Turns.** `N` is next turn and `P` is previous. Clicking a row opens its drawer: a toolbar (mask or reveal the name, hide from players, mark dead, Track as NPC, Edit, link to the map, remove) and lanes for HP, conditions, concentration, spell slots, limited uses and recharges.

**HP.** Type an amount, pick a damage type if it matters, and press **Damage** (or Enter). The heart heals that amount, the shield grants it as temp HP, and the fan-out icon opens the damage pop-up to deal it to several combatants at full or half each. A PC at 0 HP gets a **Death save** button, and successes and failures show on the row.

**Conditions.** Pick a condition and a duration: none, a number of rounds, until the start or end of the active turn, or until a save. The book button beside Add opens the condition's rules in the Compendium tab. Exhaustion stacks a level each time. A save-ended condition raises a banner at the end of the turn with **Saved, remove it** and **Failed**. Concentration takes a spell name; damage to that combatant raises a banner with the DC and **Failed, drop it** or **Kept it**.

**Rolling from the stat block.** The selected creature's stat block sits beside the list, and everything that rolls in the compendium rolls here too, into the fight's log: ability checks and saves, skills, initiative and hit dice, with Shift-click for advantage and Ctrl-click for disadvantage. Click an attack to roll to hit and damage; the damage pop-up lets you tick who takes it, full or half, and press **Apply** (`Ctrl+Enter`). **Roll all** on Multiattack rolls every attack. A save badge on a feature (DC 13 CON, say) rolls the save for every creature in the fight, marks each saved or failed, pre-selects half or full damage, and shows the PCs' bonuses so you can ask the players.

**Mid-fight.** The `+` button or `A` opens **Add to the fight**: party members, NPCs, or a creature search with a count. **Back to list** pauses the fight, and its encounter shows *combat in progress* with **Resume**. Any number of fights can wait like this (for a split party, say), and starting or resuming one pauses the fight you were in.

**Ending.** **End combat** shows a result card (rounds, XP, fallen PCs) and writes current and temp HP back to each PC card and named NPC, so the next fight starts where this one ended. Compendium creatures always start fresh, and conditions do not carry over.

**The map and the fight.** During a fight, a combatant's hidden and dead state drives its token on the map in play. Linked tokens wear their turn number; unlinked ones wear a question mark, and the token inspector offers **Link to the fight**. The drawer's **Link to map** does the same from the other side.

**Logs.** The tracker's log is saved with the encounter, and every roll also goes to the roll log in the Dice pop-up.

## The TV and the VTT

**Go live** in the VTT tab, on the strip, or `Ctrl+Shift+P` turns the table on: the TV opens full screen and phones see the table, and the button becomes a red **End live** tally. Until you go live, nothing reaches the table: the TV is closed and phones say they are waiting for you. **Settings › Displays** lists attached displays; pick one, or leave **Automatic**, which opens the TV on a display that is not the primary and, with only one display, opens no TV at all (phones still see the table). Pick your own display to see the TV there. The player window has no controls of its own.

**Scenes** (in the dock) is the list of what you can show. The new-scene row makes a title card, an image scene, a map, a blank grid or a folder; scenes nest in folders, and rows drag to reorder or move. Clicking a scene selects it and shows it in the VTT tab; Enter, double-click or the play icon makes it the **active scene**, the one the TV and phones show. Set it before going live and it waits, marked **active**, until you go live; once live it is marked **live**. **Recent** lists the last scenes set active. **Edit** sets the title, subtitle, whether the title shows on the TV, music that starts when the scene goes live, a backdrop for title cards, and DM notes.

**The VTT tab** shows the selected scene, or the live one, and carries every control for the TV:

- **Go live** and **End live** (`Ctrl+Shift+P`);
- a scene picker with previous and next (`Ctrl+Alt+Up` and `Ctrl+Alt+Down`, which select but never set a scene active);
- **Set active scene**, which becomes **Clear active scene** once the scene is active (`Ctrl+Shift+X`: the scene goes, the overlays stay; the Scenes row's ■ and the strip's stop icon do the same);
- **Blackout** (`Ctrl+Shift+B`), which hides everything, overlays too; press it again to bring the scene back;
- **Break…**, a title and a countdown on the TV; **End break** takes it down;
- undo (`Ctrl+Shift+Z`), which reverses the last scene change;
- **Overlays**: scene title, initiative strip, PC health bars, round counter, counters and timers;
- **Player devices**, the phone icon (see the next section).

With the Scenes tool open, `Alt+Up`, `Alt+Down`, `Alt+Left` and `Alt+Right` set the previous, next, parent or first child scene active.

**The initiative strip** on the TV stays on one row along the top. It starts at whoever's turn it is, shrinks its chips a little in a big fight, and folds the rest into a **+N** chip. A masked creature shows as its type, numbered like the rest (Humanoid 2).

### Maps

Drag to pan and use the wheel to zoom; this is your view, not the players'. The map toolbar holds:

- **Grid**: **Align grid to map** asks for two opposite corners of a block of cells (set **Cells across** to 10 or more for a printed grid), plus cell size, colour, opacity and **Show to players**. A blank grid also picks a parchment, stone or dark backdrop.
- **Backgrounds**: several images for one map, switched with tokens and grid kept.
- **Camera**: the dashed box the TV shows, set with **Fit map**, **Fit tokens**, **Follow active** or **Use my view**.
- **Player characters**: **Place whole party**, then click the map.
- **Creatures**: your campaign's NPCs at the top, one token each, starting neutral; then a compendium search to place any creature, or a marker token.
- **Ruler**, **Area shapes** and **Fog of war**, described below.

**Tokens** snap to the grid; hold Alt for free placement, and Delete removes the selected one. A second creature of the same name added to the map is numbered (Goblin 2). The inspector sets label, role and size, masks or reveals the name (players see the creature's type until you reveal it), hides the token, marks it dead and sets its art.

**Art.** **Set art…** (right-click a token, or the picture button in the inspector) first asks where the picture goes: **This token…**, or **Every Goblin…**, which sets the creature's art once for every Goblin token in every campaign and on its compendium page. On a PC or NPC the second choice sets their portrait, shown on their card and every token of them. Then the picture dialog opens. A marker has only itself, so it goes straight to the picture. Once a token shows art, **Remove art…** asks the same question: **This token** (the Goblin keeps its picture; this one shows none) or **Every Goblin**. A token shows its own art first, then the PC's or NPC's portrait (an NPC without one shows its stat block's art), then the creature's art; with none of those, it shows a silhouette from game-icons.net matched to the creature. Every picture is fitted to 512 px as it comes in so backups stay small; your original file stays where it was.

**Library › Images** lists every creature, PC and NPC that can be a token with its art, so you can see what still needs some. Find by name, filter by kind, type, source or campaign, or tick **Needs art**. Each row adds, replaces or removes its art. **Add from folder…** matches image files to creatures by name (`goblin-warrior.png`, `Owlbear token 02.png`), shows what matched and what did not, and adds them; art already set is kept unless you tick **Replace art that is already set**.

**Measuring.** **Ruler** in the map toolbar (`R`): drag from one square to another and the reading shows beside the end, such as *6 squares · 30 ft*. Every square counts as 5 ft, diagonals too. The reading stays until you drag again or press Escape, and a second Escape puts the ruler away. Right-drag pans while you measure. Dragging a token shows how far it has moved since you picked it up. When the map is on the TV, the players see the same line and reading, but never one that starts or ends under fog or that moves a hidden token.

**Area shapes.** **Area shapes** in the map toolbar (`S`) shows what an effect would cover. Pick **Cone**, **Sphere**, **Cube** or **Line** and its size in feet, then drag from the point of origin to aim it (it starts on the nearest grid corner; a sphere centres there). Start on a token and the effect comes from that creature: a sphere becomes an **emanation** around it, reaching its size past the edge of the creature's space, and a cone, cube or line starts at the edge of its space, facing where you drag. The ruler and fog tools work over tokens too. The squares it covers are shaded, a square counting when at least half of it is inside, as the 2024 rules suggest for grids, and the bar says how many. It's only a picture: nothing is selected or damaged. The TV and phones show it too, under the fog, unless its origin is under fog. Escape or **Clear** takes it away.

**Fog of war.** **Fog of war** in the map toolbar (`F`) opens the fog bar under the map. Tick **Fog on** to cover the whole map on the TV; you still see it, under a light hatched mist. Pick **Reveal** or **Hide**, then a **Rectangle** (drag across the map; on a grid it takes whole cells, and Alt draws freely) or a **Polygon** (click its corners; click the first corner again, double-click or press Enter to finish; Backspace drops a corner and Escape drops the shape). **Reveal all** and **Hide all** cover the whole map, and **Undo** (`Ctrl+Z` while the bar is open) steps back. Right-drag pans while you draw. Tokens whose centre is under fog do not appear on the TV at all, and the player camera ignores them, as it does tokens you have hidden. Untick **Fog on** to show the whole map again; your shapes are kept for next time. **Done** closes the bar.

## Players on their phones

Players on the same Wi-Fi can follow the table from a phone, tablet or laptop browser, with no install and no account. Nothing leaves your network. Each player picks a character and sees what is on the TV (the map, as large as their screen allows, a title card, an image or the break screen), with four tools one tap away:

- **Health**: Damage, Heal and Temp take an amount (Temp sets temp HP, and 0 clears it); Max HP and AC can be changed too.
- **Conditions**: the 14 conditions as toggles and an Exhaustion stepper, during a fight.
- **Companions**: who is in play with them, and adding companions.
- **Move**: drag a token, or tap where it should go.

A phone in portrait shows the tools as a sheet over a tab bar, a phone on its side shows a rail, and tablets and laptops keep a panel open beside the map.

### Letting players join

1. Every party member is offered to players unless you untick **Players can claim this character** on the PC card. An NPC is offered once you tick it, and only while it is not marked enemy on the live map or in the running fight. On the map, the phone button in a selected token's actions does the same for a PC or a non-enemy NPC.
2. In the VTT tab, open **Player devices** (the phone icon in the TV tools) and press **Let players join**. The first time, your computer may ask whether Trifold can accept connections: allow it on private networks.
3. Players scan the QR code, or type the address shown (`http://trifold.local`, or the number below it). **Copy link** puts both addresses on the clipboard for the group chat, and **Show join code on TV** puts the QR code on the TV until you untick it.
4. Each player picks a character and can name their device. Next session the same browser lands straight back on it.

The device list shows who holds which character and whether they are online. **Release** (or **Release all**) hands a character back to you without changing it, and **Stop** disconnects everyone. Trifold uses port 80 when it is free, otherwise one from 8130 to 8139, and keeps using the same one after that.

### What players see and change

Phones show the map that is on the TV, every revealed part of it, with fogged areas blacked out; hidden tokens and anything under fog never reach a phone. A title card, an image scene or the break screen shows on the phones as on the TV; when nothing is on the TV, or during a blackout, the phones show nothing, and until you go live they say they are waiting for you. The TV's overlays show on phones too, each while its switch in **Overlays** is on: the scene's name, the round and the initiative strip along the top (a narrow screen folds later turns into "+N"), and the timer and counters in the bottom-left corner, counting on your computer's clock. Masked creatures appear by type, numbered as on the TV.

A player's change arrives in the tracker, the PC card and the TV as if you had made it, and the fight log names their device ("Sam's phone: Brannoc heals 5"). Damage and healing count as amounts, so your hit and their heal both land. Conditions can be changed at any time: during a fight the tracker keeps them, and outside one they go on the PC card (or the NPC, or the companion) and come into the next fight. When a fight is waiting for a player's initiative, their phone shows a box for it; once they submit, or you type it first, it goes.

**Moving tokens.** A player drags their own token with one finger (one finger elsewhere pans, two fingers zoom), or taps a spot with **Move** open. Any move opens Move and waits for **Done**: until then the token sits where it was put, a faded copy marks where it started, and the ruler shows how far it goes (*3 squares · 15 ft*). Dragging it again adjusts the move without starting over, and **Cancel** puts it back. You and the TV see the planned spot and the same ruler, never a line that starts or ends under fog. A move only lands in an area the players can see (fog never lifts because a token moved) and only if nobody moved the token meanwhile; otherwise it goes back. If you start dragging a token yourself, the player's hold on it lets go at once. **Lock movement** in Player devices stops every phone moving tokens, and the lock beside a character in the device list stops just that one; their phone says "Movement locked by the DM". **Measure** at the top of Move lets a player check a distance without moving anything: a drag on the map draws a ruler (*4 squares · 20 ft*) that only their phone shows, never the TV or your map; **Clear** or closing Move takes it away.

### Companions on the phone

Players add companions from **Companions › Add a companion** on their phone, choosing from the list you keep in **Campaign › Companions**. **Add** places the creature beside the player's character on the TV's map (never under fog) and, in a running fight, adds it to the tracker. The options on each creature choose how many (numbered Skeleton 1, 2, 3…), whether it shares the character's turn or rolls its own initiative (the phone then asks for it), how many rounds it lasts in a fight, whether it is tied to the character's concentration (when that breaks, the phone asks whether to remove it), and whether it stays after the fight; the phone remembers those choices per creature. Companions that don't stay go when the fight ends. A companion belongs to whoever holds its character, and **Remove** takes it out of play without touching the campaign. Selecting a companion's token on your map says who it was summoned for and by which phone. Adding companions needs a map on the TV.

In Player devices, **Player summoning** is On, **Ask me first** (you Accept or Deny each request in the device list) or Off, and **Most per character** caps how many each character can have in play. The panel also shows how many creatures are on the companion list.

An NPC can also be a lasting companion: on an NPC, **Companion of** names a PC, such as a ranger's beast or a familiar. Whoever picks that PC gets the companion too, and loses it with the PC; a companion can also be released on its own from its chip on the phone.

**Give to…** (the send icon in a selected token's actions, or the button on a PC or NPC card) hands any character to a connected phone, enemy or not, skipping any PIN or approval.

### Getting a character back

A player who switches phones, clears their browser or wants to swap characters taps one marked **In use**. Under **Getting a character back** in Player devices you choose what happens next:

- **Open**: it is theirs at once.
- **PIN**: each player sets a 4-digit PIN with their first pick and enters it to get the character back; five wrong tries lock it for a minute.
- **Ask me first**: a dot appears on Player devices, the VTT tab and the strip, and you **Accept** or **Deny** in the list.

Taking over a character another connected phone holds works the same way, and that phone drops back to the picker. **Switch** on a phone releases its characters, with a few seconds to **Undo**.

If nobody can connect, the firewall may be blocking Trifold, or the Wi-Fi may keep devices apart (guest and school networks often do). A phone hotspot works.

## Music

**Library › Music folders › Add folder…** points Trifold at folders of MP3, OGG, FLAC, WAV or M4A files. The files stay where they are, and the refresh icon rescans. A track whose file has gone shows "missing".

**The Music tool** (in the dock, `Ctrl+M`) opens with the **Audio source** switch (**This computer** or **Phone**), then the transport, then **Tracks** and **Playlists**. Tracks lists title, length, tags, playlists and gain, with a search and a filter for tracks not in a playlist or with a given tag; tags are free text. Playlists are filled from each track's **Add to playlist…** and have shuffle, loop, their own crossfade and reorderable tracks.

**Transport.** Previous, play or pause, next, stop (with a fade), loop (off, playlist, track) and **Panic mute** (`Ctrl+Alt+M`), which silences everything Trifold plays until you press it again. Below are seek, the Master and Music volumes, the default crossfade, and the **Output** device. Every track is measured once and played at a matched loudness, and the Gain column shows the correction. A scene's **Music on go-live** starts a playlist or a single track when the scene is sent to the TV, and **Loop** under it says whether that music repeats (a playlist starts with its own loop setting).

**Phone audio.** Choose **Phone** as the audio source to play music from your phone's own apps through this computer; Trifold's player pauses. On Windows 11 the panel lists paired phones with one **Connect** button each (the computer acts as the Bluetooth speaker), and nothing connects on its own. On macOS the panel is a two-step guide to the AirPlay Receiver for an iPhone or iPad. Either way the phone's audio uses the system's default output, so Trifold's Output choice and panic mute do not reach it.

## Dice

On the strip, click a die to add one to the pool (right-click takes one away), then **Roll**; the last total shows beside the chips. The **Dice** pop-up (`Ctrl+D`) adds a modifier, Normal, Adv and Dis (for a single d20), a typed expression (`4d6kh3`, `2d4x10`, `d20+5 adv`) and the **Roll log**. The log is one list for pool, tracker, compendium and save rolls, each with its source, faces and time, oldest first with the newest at the bottom. Pin a roll from its row to keep it with the campaign: it moves into **Pinned** above the log with its name ready to type (Enter keeps it), stays there after the log is cleared or Trifold restarts, and leaves when you unpin it.

## Quick notes

Press `Ctrl+N` anywhere in the console, or open **Quick notes** in the dock, to write something down without leaving what you are doing. Give it a title (Save stays off until it has one), write as much as you like with the same formatting as any note, then press **Save** or `Ctrl+S`. The cursor goes back where it was. Escape throws the draft away.

Quick notes are ordinary notes kept in a folder called **Quick Notes** in the Campaign tab's Notes. Trifold makes the folder when it is missing, even if you deleted it, and you can rename it. Below the form the tool lists every quick note, newest first, with a find field. Open one to rename, tag, edit or delete it, move it to another folder, or open it in Notes. A note moved out of the Quick Notes folder becomes an ordinary note and leaves the list.

## Counters

Counters keep the small numbers of a session: rounds until the ritual completes, legendary resistances, torches, waves of enemies. Open **Counters** in the dock, or press `Ctrl+Alt+C` to open it with the first counter ready for the keyboard. Each campaign has its own counters, and they are there when you come back.

**New counter** (the plus) asks for a name, a starting value (0 unless you change it), an optional minimum and maximum, a **primary step** (1 unless you change it) and an optional **alternate step**. The buttons either side of the number add or take the primary step; with an alternate step, a second pair outside them adds or takes that. Click the number to type a value, then Enter (Escape keeps the old one). With a counter focused, the arrow keys add or take the primary step, Shift with an arrow (or PageUp and PageDown) the alternate step, and Home and End go to the minimum and maximum. The mouse wheel never changes a counter, so scrolling past one is always safe.

A counter with a minimum or maximum never goes past it. When it sits on one, the number turns the warning colour and says **min** or **max**, and pressing on into the bound flashes the number. Each counter has **Show on the TV**, **Reset** (back to its starting value), **Edit** and **Delete** (which asks first) at the end of its name line. Drag counters to put them in order.

**On the TV.** Up to three counters can be on the TV at once, stacked in the bottom-left corner with their name, value and maximum. A counter on the TV has its TV button lit; with three on, take one off before adding another. To hide them all for a while without unmarking any, turn off **Counters** in the VTT tab's Overlays.

## Timers

Timers are real-world countdowns for the table: "you have 60 seconds to decide", "the guards are back in five minutes". Open **Timers** in the dock, or press `Ctrl+Alt+T` to open it with the first timer's button ready for the keyboard. A campaign keeps its timers, but not whether they were running: after a restart every timer is back at its full time.

**New timer** (the plus) asks for a name and a duration: pick **30s**, **1m** or **5m**, or type one such as `90`, `1:30`, `2m` or `1m 30s`. **Chime at zero** is on unless you turn it off. Each timer has one main button: **Start**, then **Pause** and **Resume**, and **Start again** once it has run out. Next to its name are the bell (chime on or off), **Show on the TV**, **Reset** (back to its full time), **Edit** and **Delete** (which asks first). Run as many as you like at once, and drag them into order. Changing a running timer's duration takes effect when you reset it.

When a timer reaches zero its card turns red, pulses, says **Time's up** and stays at 0:00 until you reset or start it again; the Timers icon in the dock shows a red dot so you notice even with the tool closed. A timer with its bell on plays a short chime over your music without interrupting it, and panic mute silences it like everything else.

**On the TV.** One timer at a time can be on the TV, shown large in the bottom-left corner above any counters. Choosing another timer for the TV moves it there. The TV counts down by itself and shows the alert at zero. To hide it for a while, turn off **Timers** in the VTT tab's Overlays.

## Web tabs

A web tab is a page you choose, shown inside the stage. In a group's `+` menu pick **New web tab…** and give it a name (left blank, it follows the page title), an address and an icon. Browsing inside the tab never changes its saved address: Home returns to it, and **Use current page** in the edit panel is the one way to change it. Logins persist between launches. The × parks a tab in the `+` menu, and **Remove** forgets it. Zoom (`Ctrl+=`, `Ctrl+-`, `Ctrl+0`) is per tab and remembered. Every tab has **Open in system browser**, and hotkeys with Ctrl or Alt pressed inside a page still reach the console.

## Settings

Settings is one page of sections, most used first.

- **Table display** picks the screen the TV opens on. Screens are numbered from left to right, with the monitor's name when Windows or macOS gives one. **Identify** shows each screen's number on it for a few seconds, and **Refresh displays** picks up one you just plugged in. **Automatic** uses a screen that is not the primary; with one screen, only players' phones show the table.
- **Appearance**: **Theme** (dark or light, saved with the Library) and **Text size** (Small to Extra large), which zooms the whole console on this computer. The TV is never zoomed.
- **Backups** and **Updates** are described below.
- **Library** shows the folder, with **Open folder** and **Open another Library…**. Once you have used more than one Library, **Recent Libraries** lists the others: the folder button opens one, the × takes it off the list (its folder is kept). **Sample campaign** adds or resets *The Lantern at Greyford*.
- **Troubleshooting** shows the search index's status with **Rebuild index**, and **Open logs folder**.
- **About** shows the version, with **Copy version info** for a bug report, and the credits for the SRD, the icons, the sample campaign's maps and the fonts.

**Updates.** Trifold can check whether a newer version is out each time it starts, and once a day while it stays open. It is off until you say so: the Campaigns page asks once, and the switch in **Settings › Updates** changes your answer at any time. **Check now** asks straight away, whether the switch is on or off. The check reads the project's public release list and sends only Trifold's version number. When a newer version is out, an **Update available** button appears in the top bar. If you installed Trifold with the Windows installer, the new version downloads in the background (its progress shows in Settings › Updates) and the button then reads **Restart to update**. Nothing installs until you press **Restart now** in Settings › Updates: Trifold saves, makes its on-close backup, installs the update and opens again. While it installs, a small "Updating Trifold" window shows its progress; Trifold opens again by itself when it finishes. Each update is checked against the project's signature first, and one that fails is never installed. With the portable exe or on a Mac, **Download** opens the release page in your browser. **Not now** hides the top bar button until the next version. If a check or download fails (offline, say), the reason shows in Settings › Updates and Trifold tries again later.

## Backups and moving data

**Daily backups.** In **Settings › Backups**, with **Daily backup** on, Trifold zips the Library into its `backups` folder once a day while it is open, and again on close if anything changed (`<date>-quit.zip`). **Back up now** writes one whenever you like. A zip holds everything except the search index, logs and earlier backups; your music files live outside the Library and are not included. **Keep** sets how many days of zips stay.

**Second copy.** **Choose folder…** names a folder on another drive, or one your cloud sync app keeps, and every backup is copied there under `Trifold backups/<Library folder name>/`. That folder keeps the same days of zips as the Library, plus one a week for eight weeks. Settings shows when the last copy was made, or the error when the folder cannot be reached. **Stop copying** turns it off.

**Restore.** Open **Backups in this Library** to see the zips; each has a restore icon, and **Restore from file…** takes any backup zip, including one from your copy folder on a new computer. Restoring **replaces** the Library with the backup rather than merging; a zip of the current state is written first and kept for 30 days.

**Campaign export.** The export icon on a campaign card opens its options. **State** is **As it is now** (everything, including a fight in progress) or **Fresh start** (keeps notes, maps, token positions, encounters and NPCs; resets HP, the dead and fights in progress). Tick **Party**, **Homebrew it uses** and **Console layout** as needed. Leaving the party out also leaves out the PCs' tokens on the maps, anything they summoned and their places in encounters, and puts away a fight in progress that a PC is in. Then **Export…** writes `<campaign name>.trifold-campaign`. Imported compendium sources and scene music are never included.

**Campaign import.** **Create campaign › Import a Trifold campaign** on the Campaigns page picks a `.trifold-campaign` file, shows what it holds and offers **Import**. If the Library already has that campaign, choose **Replace…** (a backup is written first) or **Import as a copy**.

**Logs.** Trifold writes `trifold-<date>.log` in the Library's `logs` folder, or in the app's own data folder before a Library is open.

## Hotkeys

Ctrl means the Command key on macOS, and Alt means Option. Keys without Ctrl or Alt do nothing while you are typing in a field. The Hotkeys button in the top bar (`Ctrl+/`) shows the hotkeys that work on the current screen.

| Area        | Action                                                            | Combo                                          |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Console     | Search the campaign and compendium; in the Library, every campaign | `Ctrl+F`                                       |
| Console     | Jump to the compendium search                                     | `Ctrl+K`                                       |
| Console     | Quick note: jot something down without leaving your place         | `Ctrl+N`                                       |
| Console     | Counters: open the tool and focus the first counter               | `Ctrl+Alt+C`                                   |
| Console     | Timers: open the tool and focus the first timer                   | `Ctrl+Alt+T`                                   |
| Console     | VTT: the scene on the TV                                          | `Ctrl+T`                                       |
| Console     | Music: transport, playlists, tracks                               | `Ctrl+M`                                       |
| Console     | Dice                                                              | `Ctrl+D`                                       |
| Console     | Hotkey sheet                                                      | `Ctrl+/`                                       |
| Console     | Settings, in the Library                                          | `Ctrl+,`                                       |
| Console     | Maximize or restore the focused stage group                       | `Ctrl+Shift+M`                                 |
| Console     | Apply layout 1 to 9                                               | `Ctrl+1` to `Ctrl+9`                           |
| Console     | Close the open pop-up or flyout                                   | `Escape`                                       |
| Quick notes | Save the quick note                                               | `Ctrl+S`                                       |
| Counters    | Add or take the primary step on a focused counter                 | `Up`, `Down`                                   |
| Counters    | Add or take the alternate step (the primary one if there is none) | `Shift+Up`, `Shift+Down`, `PageUp`, `PageDown` |
| Counters    | Go to the minimum or maximum, when set                            | `Home`, `End`                                  |
| TV          | Go live, or end it                                                | `Ctrl+Shift+P`                                 |
| TV          | Toggle blackout on the TV                                         | `Ctrl+Shift+B`                                 |
| TV          | Clear the active scene (overlays stay)                            | `Ctrl+Shift+X`                                 |
| TV          | Undo the last scene change                                        | `Ctrl+Shift+Z`                                 |
| TV          | Select the previous or next scene in the VTT tab (does not send)  | `Ctrl+Alt+Up`, `Ctrl+Alt+Down`                 |
| Scenes      | Send the previous or next scene                                   | `Alt+Up`, `Alt+Down`                           |
| Scenes      | Send the parent scene, or the first child scene                   | `Alt+Left`, `Alt+Right`                        |
| Map         | Movement ruler                                                    | `R`                                            |
| Map         | Area shapes (cone, sphere, cube, line)                            | `S`                                            |
| Map         | Fog of war tools                                                  | `F`                                            |
| Map         | Undo the last fog change (while the fog bar is open)              | `Ctrl+Z`                                       |
| Combat      | Next turn                                                         | `N`                                            |
| Combat      | Previous turn                                                     | `P`                                            |
| Combat      | Add to the fight                                                  | `A`                                            |
| Combat      | Apply the damage in the pop-up                                    | `Ctrl+Enter`                                   |
| Music       | Play or pause music                                               | `Ctrl+Alt+P`                                   |
| Music       | Previous or next track                                            | `Ctrl+Alt+Left`, `Ctrl+Alt+Right`              |
| Music       | Cycle music loop: off, playlist, track                            | `Ctrl+Alt+L`                                   |
| Music       | Panic mute all audio                                              | `Ctrl+Alt+M`                                   |
| Web tab     | Zoom the web tab in                                               | `Ctrl+=` or `Ctrl+Shift++`                     |
| Web tab     | Zoom the web tab out                                              | `Ctrl+-`                                       |
| Web tab     | Reset the web tab zoom                                            | `Ctrl+0`                                       |

The scene-sending keys work while the Scenes tool is open, the map keys while a map is in the VTT tab, and `A` and `Ctrl+Enter` while the tracker is on screen.

## Troubleshooting

**"No bundled content in this build"** in Settings › About means the build was made without the SRD. Searches stay empty until you import a compendium XML file.

**The TV opened on the wrong display.** Close it, pick the right display in **Settings › Table display** (press **Refresh displays** if it is missing, and **Identify** to see which screen is which) and open it again.

**No sound, or the wrong speakers.** Check that the strip is not showing **Muted**, then check the **Output** menu on the Music transport. Phone audio ignores that menu and uses the system's default output.

**Search misses a record you know is there.** **Settings › Troubleshooting** shows the index status, with **Rebuild index** beside it. Rebuilding re-reads every file in the Library and loses nothing. Trifold keeps the index up to date on its own, so this is only a repair. If the status says unavailable, the reason follows in brackets and rebuilding is switched off; restart Trifold, and if it stays unavailable, check the logs.

**Players can't connect.** See the end of [Getting a character back](#getting-a-character-back): usually the firewall or a Wi-Fi network that keeps devices apart.

**You need details on an error.** **Settings › Troubleshooting › Open logs folder** opens the logs; the newest file is today's. **Settings › About › Copy version info** copies the version for a bug report.
