# ADR 0014 · A panel floor, a folding stage, and one set of layout switch points

**Status:** accepted, 2026-11-07. Refines ADR 0004 §3 (stage and dock) and ADR 0009 (dock states), and DESIGN.md §9.

## Context

A screenshot audit at nine panel widths found:

- **Panels could be squeezed until they were unusable.** The window had a 1000 px minimum, but the stage had no floor. The divider allowed anywhere from 20/80 to 80/20, and the dock could be dragged out to 800 px. At the smallest window a panel could be about 40 px wide; with the default dock it was still about 120 px.
- **Half-screen was impossible.** The 1000 px minimum is wider than half of a 1920 screen, so Windows snap could not dock Trifold beside another window.
- **Layouts switched at the wrong moments.** Feature layouts changed columns based on the whole panel's width, at eight unrelated widths. Right after each switch the narrowest column was starved:
  - The initiative list was about 300 px, with names wrapping onto three lines.
  - The compendium list was about 320 px but still showed every column, truncating names.
  - Combat gave the log a full-height column that was mostly empty.
- **Narrow panels scrolled sideways,** and the dock's Music tool broke below 360 px.

## Decision

- **A floor, not just a window minimum.** No stage group is ever narrower than 480 px (`PANEL_MIN`). No dock with sections is narrower than 360 px (`DOCK_MIN`), and the narrow dock preset is now 360. The divider and the dock edge stop where a panel would go under its floor.
- **The window decides what fits** (`fitLayout`). Its result is display-only and never saved:
  1. The dock gives way first: a wide or narrow dock shows as icons when the panels need the room.
  2. If two groups still do not fit, they **fold** into one stack. Both stay mounted; the focused group is on show under one strip listing every tab. Picking a tab shows its group.
  3. Widening the window brings the saved layout back exactly.
  4. The DM can still expand a trimmed dock, which folds the groups instead, as long as one panel keeps its floor.
- **At most two groups** stays (ADR 0004). More groups for ultrawide screens can come later as their own change.
- **The window minimum drops to 760 px:** one panel at its floor plus the icon dock. That is half of a 1920 screen at 125% scaling. Below 1180 px the live strip hands its dice pool to the Dice button. Below 960 px the strip drops previous/next track (both have hotkeys and live in Music), and the top bar shows Hotkeys as an icon.
- **One set of layout switch points.** A panel's own layout changes columns only at 640 or 960 px, and only when every column gets the room it needs. An inner part (a list, a row, a drawer) responds to its own width through its own container, never to the panel's. Secondary content such as a log is a strip, not a column. Below 960 px a list-and-detail panel shows the list or the detail, with a way back.
- These rules join `docs/UI-GUIDELINES.md`.

## Consequences

- No panel can be dragged or resized into an unusable width. Features only have to work from 480 px up.
- On a 1366 px laptop, combat and the map still sit side by side next to a 360 px dock. On half of a 1920 screen they fold into tabs of one stack.
- Tab dragging is off while the stage is folded, because a combined strip cannot say which group a tab belongs to. So are split-right and the split drop zone when a second group would not fit.
- A layout saved with a narrow dock under 360 px opens at 360.
