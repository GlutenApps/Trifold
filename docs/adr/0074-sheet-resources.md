# ADR 0074 — Resources on the Trifold sheet

**Status:** accepted, 2026-11-23. Item 6 of the schedule to release in `docs/PLAYER-MODE.md`, added to Part 3 by Ian on 2026-11-23.

## Context

The Trifold sheet holds totals (spell slots by level, features) but nothing a session spends: slots used, a feature's uses, hit dice, Heroic Inspiration. A player tracking a session had to keep those elsewhere. HP and conditions are the table's (PLAYER-MODE.md, Who owns what), and the GM's combat tracker already records death saving throws on the combatant.

## Decision

- **A Resources section** on the Trifold sheet (Ian chose the name), on the sheet being edited and on the Sheets tab at the table:
  - Heroic Inspiration, a checkbox;
  - spell slots spent, a row of boxes per slot level;
  - each feature with limited uses, a row of boxes and whether a short or long rest brings them back;
  - hit dice by die size ("Hit dice: 2 of 3 d8 left"), each with **Spend a d8**;
  - **Short rest** and **Long rest**, which say what came back, with Undo.
- **On the sheet** (`DATA-FORMATS.md` §5.7), all optional so existing files load unchanged:
  - `slotsUsed` by slot level;
  - `slotsOnShortRest` for Pact Magic, set by the builder for a Pact caster and editable beside the slots;
  - `hitDiceUsed` by die size;
  - `inspiration`;
  - a feature's `uses` (`max`, `used`, `reset`), set beside the feature in the editor.
- **Rests** (`packages/rules/src/character/resources.ts`):
  - A short rest brings back short-rest features, and the slots when they are Pact Magic.
  - A long rest brings back every use and every slot.
  - Hit dice on a long rest follow the character's rules. The 2024 rules bring them all back; the 2014 rules bring back half the character's total (at least one), largest dice first.
  - A rest on the sheet changes only the sheet. The GM's Long rest on the Party tab still restores HP at the table.
- **Hit dice heal through the table** (Ian's choice). Spend rolls the die, adds Constitution (at least 1) and marks it spent. On the Sheets tab while at the table, the healing is sent as an `hp` intent, the same change the HP editor sends. Away from a table it shows the total to add.
- **Death saves stay with the table** (Ian's choice): the GM's tracker records them, as it does HP, and the sheet keeps no second copy.
- A class's hit die comes from its name (the SRD classes; d8 for one Trifold does not know).
- Import from PDF reads "(2 / short rest)" in a feature's name as its uses and takes the note out of the name.

## Consequences

- A session's spending is kept in the character file, saved as it changes, and survives closing the app.
- Feature uses are set by hand except where an imported sheet writes them; the builder does not set them from the class table yet.
- The table does not send death saves to the player yet; showing them is left for later.
