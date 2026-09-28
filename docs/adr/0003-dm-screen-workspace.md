# ADR 0003 — The console is a DM screen of panels, not a page per section

**Status:** superseded by ADR 0004 (stage, dock and live strip), 2026-09-28.

## Context

`DESIGN.md` §9 described the console as a left rail that swaps one page into the main area. At the table this meant leaving the presenter to touch music or dice, and never seeing the combat tracker and the map at the same time. The one-shot DM asked for a screen where the big features sit side by side and the small ones stay one tap away.

## Decision

- **Workspace.** The main area is a set of columns, each a stack of *panels*. Panel kinds: campaign, compendium, encounters, combat, presenter (scenes), music, dice, settings. One panel per kind. The rail opens or focuses a kind; the panel chrome closes, maximizes, moves (left, right, up, down, own column), and a header can be dragged: a silhouette shows where it lands (beside, above or below another panel, or at a workspace edge). Drag handles between columns and between stacked panels resize them. The layout and named layouts are saved per Library in `library.json` (`settings.workspace`). Layouts are entirely the DM's: apply (also `Ctrl+1`…`Ctrl+9`), overwrite with the current screen, rename, reorder, delete. Three starter layouts (Prep, Table, Combat) are copied in once on a fresh Library and can be deleted or brought back; nothing is locked.
- **Tray.** A bottom utility bar holds the minor features inline: live scene with blackout and the player-window toggle, combat round with previous/next, music transport with panic mute, and a quick dice field. Each segment opens a drawer with the fuller control (TV overlays, handouts and break; the turn order; the full transport; the roller and log; the hotkey sheet). Nothing in the tray requires leaving a panel.
- **Combat is its own panel.** Starting a fight from an encounter or a map scene opens the combat panel next to whatever else is open, instead of replacing the encounters page.
- **Palette and type.** "Slate and bone": near-monochrome slate surfaces with warm bone as the only accent, so ally, enemy, healthy, bloodied and down carry all the colour. Outfit (UI) and IBM Plex Mono (numbers) are bundled under the SIL Open Font License; the trifold mark sits in the rail.

## Consequences

- Every feature must render inside a panel of any size: pages drop their own `h1`, stretch to the panel body, and scroll inside it.
- Duplicated controls are avoided by placing each control in one home (blackout and the player toggle live in the tray, not the presenter panel). Where a control appears in both a panel and a drawer (dice), the accessible names differ.
- Hotkeys that navigated (`Ctrl+D` dice, `Ctrl+,` settings) now open a drawer or a panel. `Ctrl+Shift+M` maximizes the focused panel; `Escape` closes the drawer.
- The layout schema is additive (defaults fill in), so `library.json` stays at schema version 1.
