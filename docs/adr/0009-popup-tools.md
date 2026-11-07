# ADR 0009 · Dice, Hotkeys and Layouts pop up from their buttons

**Status:** accepted, 2026-11-06. Amends ADR 0004: the dock keeps the tall tools (Music,
Scenes); Dice, Hotkeys and Layouts leave it.

## Context

After ADR 0008 the dock held five minors. Three of them had a second home already:

- Hotkeys and Layouts were buttons in the top bar that opened a dock section (or a flyout).
  The dock listed them again as toggles, so the same tool had two switches a hand's width
  apart and took a dock slot a session never needs for long.
- Dice had a compact pool on the live strip (chips, Roll, last total) and a dice button that
  opened the Dice section on the far side of the window. Rolling from the strip and reading
  the log in the dock meant looking in two places for one action.

Neither is a tall tool. A hotkey sheet and a layout list are things you glance at; the dice
tool is the pool plus a log you open when a roll needs checking.

## Decision

- **The dock is for the tall tools.** Its minors are Music and Scenes. The schema's
  `MINOR_KINDS` drops `dice`, `hotkeys` and `layouts`; library schema 4 → 5 drops their
  sections from saved layouts and starters without resetting them. A layout no longer
  records whether a pop-up was open.
- **Dice, Hotkeys and Layouts are pop-ups** (`pop` in the shell store, one at a time):
  the same panel as a flyout, but anchored to the button that opens it. Hotkeys and Layouts
  drop down from their top-bar buttons. Dice rises from the dice button on the live strip.
  Escape, the button again, or a click elsewhere closes it; applying a layout keeps the
  Layouts pop-up open so several can be tried in a row.
- **The strip's dice sit at its right end**, in this order left to right: last total, the
  die chips, Clear, Roll, then the Dice button in the corner. The pop-up opens right above
  the button it came from.
- Ctrl+D and Ctrl+/ toggle their pop-ups. Ctrl+M still opens Music in the dock or as a
  flyout.
- **The top bar's dock toggle is removed.** With two tall tools the dock is wide, narrow or
  icons, chosen from its own header and the drag edge; it is never hidden. `hidden` stays in
  the schema so old layouts parse, and `normalize` shows such a layout as icons.

## Consequences

- Every tool has one switch: top bar for Layouts and Hotkeys, strip for Dice, dock tabs for
  Music and Scenes. The dock's tab row is two icons, so Scenes and Music share the height
  with less competition.
- The live strip is still a mirror (ADR 0008): the Dice button is the way into the Dice
  tool, which is the home of the modifier, Adv/Dis, typed rolls and the log; the strip's
  chips and Roll remain copies with their own accessible names.
- Hotkeys and Layouts pop-ups are 440 px wide so their tables keep their columns; Dice
  keeps the flyout width.
- Not done: a pop-up that remembers its size; dragging a pop-up; more than one at once.
