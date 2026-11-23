# ADR 0068 — Characters: External and Trifold

**Status:** accepted, 2026-11-23. Part 3, phase 5 of `docs/PLAYER-MODE.md`, first part: the character file, its numbers and the Library's Characters page. The Sheets tab, linking in a joined campaign, the `sheetUrl` migration and sheet updates follow.

## Context

`docs/PLAYER-MODE.md` (Part 3) has the player own the character sheet in their Library, and the GM's PC card take only its table numbers. It plans three ways in: keep the sheet elsewhere (Way 1), import a PDF (Way 2, later) and a Trifold sheet with a builder (Way 3). The sheet model and its derived numbers come first; the PDF import and the builder both write sheets.

The DM named the two kinds a new character offers now **External character** and **Trifold character**, and chose a one-way switch from External to Trifold (2026-11-23).

## Decision

**The file.** `Library/characters/<id>.json`, file kind `character` at version 1 (`packages/schema/src/character.ts`, DATA-FORMATS §5.7), read and written through `LibraryStore` like every Library file.

- `kind: 'external'`: `numbers` holds the **table numbers** the player enters, field for field the PC card's (class line, level, max HP, AC, initiative bonus, speed, the three passives, saves, spell save DC), in the ranges the table accepts. `sheetUrl` is the **character sheet link**, `http` or `https` only.
- `kind: 'trifold'`: `sheet` holds species, background, classes with subclass and level, ability scores, save and skill proficiencies (proficient or expertise), other proficiencies, max HP, armour (none, light, medium or heavy, a base, a shield, a bonus), speed, spellcasting ability, attacks, features, spells, equipment and `overrides`.
- `edition` is `2024` or `2014`. A character in a campaign follows its edition once linked; one outside any picks its own.
- Attacks, features, spells and items may name a compendium record as `ref: { kind, key, name }`, so a sheet reads by name when the record is gone and resolves again when it is back. Nothing sets a ref yet; picking from the compendium comes with the Sheets tab or the builder.

**Numbers are worked out** by pure functions in `packages/rules/src/character/derive.ts`: modifiers, level (class levels added up), proficiency bonus, saves, skills (expertise doubles), passives, AC by armour kind, initiative, spell save DC and attack, an attack's bonus to hit. Each can be set by hand: an override is shown as set by hand, says what the sheet works out, and resets. `tableNumbers(character)` gives the PC card's numbers for either kind: an External character's as entered, a Trifold one's from its sheet.

**External → Trifold, one way.** `sheetFromNumbers` starts the sheet from the entered numbers: the class line read back into classes (`parseClassLine`), max HP and speed as entered, and every other number kept as an override, so what the table sees does not change until the player fills the sheet in.

**Library › Characters**, behind `TRIFOLD_PLAYER_MODE` with the rest of player mode: the list (name, class line, AC, HP, kind, rules), **New character** (a name and the two kinds), **Import character…** (a JSON file; a taken id gets a new one), and a character's editor on the same page with its name, rules, **Export** and **Delete** (typed DELETE, as for a campaign). Every change shows at once and is written 400 ms later; leaving the editor writes what is pending.

## Consequences

- A GM-only Library sees no change: the page is behind the player-mode flag.
- The Trifold sheet is filled in by hand until the 2024 builder (phase 7) writes it; the numbers it works out are the same either way.
- The PDF import (phase 6) writes the same file.
