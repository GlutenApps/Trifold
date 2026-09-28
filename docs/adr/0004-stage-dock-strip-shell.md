# ADR 0004 · Console shell: stage, dock and live strip

**Status:** accepted, 2026-09-28. Supersedes ADR 0003 (DM screen workspace). The Combat major is folded into Encounters by ADR 0005.

## Context

ADR 0003 made every feature a panel: the rail opened panels, each took a
column or a stack, and a bottom tray held small tools in drawers. Opening
anything, however small, split the screen and squeezed the rest, so the DM
kept re-arranging. The one arrangement that must work at the table, combat
beside the map, competed with everything else for the same space.

## Decision

Two spaces, and inside the console three kinds of chrome with one job each.

**Spaces.** The Library holds what is shared by every campaign: the campaign
list, compendium sources and homebrew, music folders, settings. The console is
the inside of exactly one open campaign. Opening another campaign closes the
current one; if a scene is on the TV or combat is running, the app warns that
sharing will stop before it does.

**Stage.** Majors (Campaign, Compendium, Encounters, Combat, Map) are tabs in
at most two groups. All five are open by default; closing a tab keeps its
state; a + on each strip adds or moves a major. Two groups is the ceiling and
is how combat sits beside the map. Ctrl+K opens Compendium in the group not
holding Combat.

**Dock.** Minors (Dice, TV controls, Music, Scenes, Hotkeys, Layouts) are
toggled sections in a right-hand dock that is wide, narrow, icons only or
hidden, and never takes stage space beyond its own width. Icons only or
hidden, a tool opens as a flyout; Escape closes it.

**Live strip.** A 42 px bar with table state only: what is on the TV, the
player window, round and turn, music and mute, the shared dice pool; plus
the one-tap actions. It never carries app chrome or names.

**Top bar.** The frameless window's title bar: mark → Library, campaign
breadcrumb → switcher, current layout, Hotkeys, Settings, dock toggle,
window controls.

**Rules.** Majors are never in the dock; minors are never on the stage. The
Presenter is split into Map (major) and Scenes (minor). Music, including the
library, is a minor; folder management is in the Library. Turn order is
removed; the strip covers it. There is one roll log with a source on every
entry. Scenes: click selects, Enter/double-click/▶ sends. Homebrew inside a
campaign is limited to name, CR, abilities and features. The only modal is
the close-campaign warning. Layouts capture chrome only and are app-wide.

## Consequences

- Combat beside the map is a first-class arrangement (the Table layout) and
  survives the dock, lookups and music without re-arranging.
- The shell has fewer concepts than ADR 0003 (no free-form panel columns, no
  tray, no rail) but two new ones: tab groups and the major/minor rule.
- Vertical space in the dock is finite: two tall tools do not fit side by
  side at 900 high; the last open section scrolls inside. The Music and
  Scenes tools are the tall ones.
- Removing Turn order and the Music major is a change of habit for current
  users; the strip and the dock take over their jobs.
- The frameless window makes the top bar free; if that ever reverts, the bar
  costs 34 px of stage height.
- Not done: hotkeys for majors, a third stage group, extra minors, any cloud
  or account affordance.

## Implementation notes (2026-09-28)

- The window uses Electron's hidden title bar with the native Windows controls overlay rather than a fully custom frame, so snap layouts, double-click to maximize and the system menu keep working; the top bar reserves the overlay's width.
- Layouts and each campaign's console state are stored in the Library's `library.json` (`settings.workspace`, schema version 2 with a migration from 1). A Library is the app's only data root, so this is app-wide in practice while staying files-first.
- Decision 9 (one roll log) is implemented as one roll store with a `source` on every entry (pool, tracker, save); the Combat tab keeps its own narrative log (turns, notes, rolls) because that log is saved with the encounter.
- Dock sections reorder through the strip's order; header drag-to-reorder is not built.
- Homebrew inside the campaign reuses the full monster editor rather than a reduced one.
