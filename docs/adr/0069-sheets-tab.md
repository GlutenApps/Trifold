# ADR 0069 — The Sheets tab and linking a character

**Status:** accepted, 2026-11-23. Part 3, phase 5 of `docs/PLAYER-MODE.md`, second part; follows ADR 0068.

## Context

`docs/PLAYER-MODE.md` ("My characters and Sheets") has the player console's dock tool, My characters, act at a high level, and a stage tab, Sheets, show the selected creature in full, as Scenes and the VTT tab do for the GM (ADR 0008). A joined campaign already keeps a `characterId` in `joined.json`; nothing set it. Characters now exist (ADR 0068).

## Decision

**Linking.** `joined.linkCharacter(campaignId, characterId | null)` writes `joined.json`'s `characterId`, in the same queue as the connection's own saves to that file. Under its rows, My characters shows:

- with no character linked: **Link a character** (a list of the Library's characters) and **New character**, which makes one (External or Trifold, as on Library › Characters), links it and opens it in Sheets to fill in;
- with one: "Your sheet: <name>" and **Unlink**; the character stays in the Library.

It shows the same while the table is not up. Linking lives only here: Sheets with nothing linked says to link one under My characters (one home for a control, ADR 0013).

**Opening.** Each row of My characters has **Open sheet**, and a double-click on its name does the same: Sheets comes forward on that creature. The player's own row also has the pencil, which opens the sheet to edit. A row click still only selects, so changing HP mid-fight never puts a sheet over the map.

**Sheets** shows the creature picked in My characters (the player's own when none is):

- A switcher along the top mirrors the dock's rows when there is more than one.
- **The player's character:** the linked character's sheet to read at the table. The numbers a fight needs come first (AC, max HP, initiative, speed, proficiency, the passives, spell save DC and attack), a number set by hand marked as such; then abilities and saves, skills, attacks with their bonus to hit, spells by level, features (folded, with their text), equipment and notes. An External character shows its table numbers and saves. **Open character sheet** opens the sheet link as a web tab (ADR 0011). **Edit** switches to the same editor as Library › Characters, with the name above it and **Done** to go back; changes save as they do there.
- While connected, the table's live HP and conditions sit above the sheet: the same controls and requests as the row's, never a second copy.
- **A companion or summon:** its name, type, AC, HP and conditions, as the table sends them, live while connected. Its stat block needs the view to say which record it is; that is left for later.

## Consequences

- Nothing about a linked character reaches the GM yet: sheet updates (`sheetOffer`) are the next part of phase 5.
- The sheet's live HP control and the row's carry the same accessible name, by the plan's choice of "the same live controls as the row's"; they sit in different panels.
