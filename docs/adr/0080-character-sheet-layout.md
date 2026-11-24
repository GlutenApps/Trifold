# ADR 0080 — The character sheet's layout, and what looks pressable

**Status:** accepted, 2026-11-24. Ian's call, from a mockup made outside the code and brought back with two changes.

## Context

The sheet (`SheetView`, ADR 0069) grew a section at a time: numbers, resources (ADR 0074), rolling (ADR 0075), linked rows (ADR 0073). It became one long column where every part had the same weight. AC, the spell slots and the roll just made had no more presence than languages or gold. Ten equal number boxes wrapped awkwardly, slots and the spells that use them sat in different places, and rollable numbers differed from plain ones only by a dotted underline.

Ian took a capture of the sheet to a design session and brought back a layout. He asked for two changes: its tabs should be the app's own, and things you can press should be told apart from things you can only read.

## Decision

**Layout.** The sheet is, top to bottom:

- **Header:** name, class line, species, background, Edit.
- **Turn bar.** It sticks to the top of the panel's scroll and uses the compact tier. It holds the table's HP and conditions (the same `HpChip`, `HpEditor` and `HeldConditions` as before), Normal / Advantage / Disadvantage (one roll, then back to Normal), and a one-line readout of the last roll. A rest, a hit die or a cast says itself in the readout too, with Undo.
- **Four tiles:** AC, Max HP, Initiative, Speed. When the table's maximum HP differs from the sheet's, a "table N" badge says so.
- **Abilities and skills,** pinned on the left once the sheet itself is 640 px wide (280 px from 960). Below that width they are one of the tabs.
- **Sub-tabs:** Actions (attacks and resources), Spells, Features, Equipment, Notes. A tab shows only when the sheet has something for it. The tabs are the app's `SubTabs`, the folder tabs of the Compendium and the Campaign tab, with **More** for tabs that do not fit. They stick under the turn bar.

Columns follow the sheet's own width through container queries at 640 and 960 px (UI guidelines §10). Inner columns (attacks beside resources, spell levels two-up, features in two columns) follow each tab's width.

**Resources.** Everything countable is a row of pips: a filled dot is one left, and pressing one spends or gives back one. This covers Heroic Inspiration, limited-use features, hit dice and spell slots. Slots sit on their own spell level's heading, not under Resources. Each levelled spell has a quiet **Cast** row action that spends a slot of its level (`spendSlot` in `packages/rules`). It is disabled, with the reason in its tooltip, when the spell is not prepared or no slot is left. Long rest asks first, inline. The editor on Library › Characters uses the same pips, with its slots still under Resources.

**Spells** are grouped by level, cantrips first ("At will"). Prepared spells come first; unprepared ones are dimmed, badged "not prepared" and sorted last. A toggle hides them, leaving "N more not prepared". Cantrips are never marked unprepared.

**Pressable or readable.** One rule, everywhere on the sheet:

- **Pressable** is a box with a control's border and radius, raised a pixel: a rollable number, the Initiative tile, the app's buttons. A pip is pressable too, as a dot in a round target that lights on hover.
- **A row** lights on hover only when it opens (spells, features and items with text or a linked record, behind a chevron, and the name underlines) or has an action.
- **Readable** is flat text, or a recessed well with no border: AC, Max HP, Speed, the ability cards and the readout.
- **Proficiency** is a small diamond, never a round dot that could pass for a pip.
- **Where nothing rolls or tracks** (the GM's card, the PDF preview, the builder's review), the same numbers are plain text and the pips are smaller and inert.

The game numbers are the app's own (`deriveSheet`, `attackBonus`, `tableNumbers`, the rest rules of ADR 0074), not the mockup's re-derivations. Damage still rolls the dice as written on the sheet.

## Consequences

- `.turnbar` joins the chrome bars that take the compact tier; `.sh-row` joins the rows whose quiet actions come up on hover (ADR 0020).
- The readout replaces the line under the roll mode and the resources' status line on the sheet. The editor keeps its status line.
- `LinkedRow` (a `<details>`) is replaced by `SheetRow`, a button with `aria-expanded`. `LinkedText` is unchanged.
- Not done: upcasting a spell with a higher slot. The tab a narrow sheet had open becomes Actions when the sheet widens past 640 px with Abilities selected.
