# ADR 0082 — Spells and equipment are changed in their own tabs

**Status:** accepted, 2026-11-24. Ian's call, after trying places (ADR 0081).

## Context

Adding, changing or removing a spell or an item meant pressing Edit, then scrolling a long editor to the right list. Setting where an item is kept was only in the editor, so a player looking at the Equipment tab could not find it. Ian: things can live in the editor, but it cannot be the only place; adding, editing and removing should be housed in the tabs themselves, for Spells and Equipment.

## Decision

- **Add.** Spells and Equipment each have an Add button in the tab's header ("Add a spell", "Add an item"; UI guidelines §9). It opens a search at the top of the tab: compendium records of that kind as you type, each added with a click and linked to its record (a spell takes its level from it), and what was typed added as written (a spell at a level picked beside it). Escape or Close puts it away.
- **Spell rows** have three quiet actions (ADR 0020), each in its place on every row:
  - **Prepare,** a toggle. On cantrips it is pressed and disabled, because cantrips are always ready.
  - **Cast.** On cantrips it is disabled, because they use no slot.
  - **Remove.**
- **Item rows** have Equip, Attune (disabled where the item does not need attunement), Change (the pencil) and Remove. Change opens a small editor under the row: name, how many, where it is kept, and charges with when they come back. Each change saves as it is made. While it is open the item stays in the group it was in, so typing a new place does not move it away mid-word; it moves on Done.
- **Remove** is a removal from a list (`close`, no confirm). The turn bar's readout says what was removed or added, with Undo.
- **Where the tabs show.** On a sheet that can be changed, the Equipment tab always shows, and Spells shows for a caster, so Add has somewhere to be. The "On you" heading always shows, so places are plain before any is set.
- **The editor keeps every field.** Read-only sheets (the GM's card, a preview) have none of this.

## Consequences

- A new name drops an item's link to a record with another name, and with it the armour and attunement it knew, as in the editor.
- The editor itself still needs reworking (docs/CHARACTER-SHEET.md, item 33).
