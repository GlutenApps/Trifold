# ADR 0023 · The DM chooses what the tray shows, up to four sections, saved with the layout

**Status:** accepted, 2026-11-10. Amends ADR 0004 (the live strip's fixed sections), ADR 0019 and
ADR 0021 (counters and timers gain a home on the strip).

## Context

The live strip (the tray along the bottom) has fixed sections: VTT, Encounters, Music, then Dice.
A DM who runs without a TV or without music still gives them the room, and the things that do
run at the table in real time, a countdown or legendary resistances, live only in the dock.
A pin button on every timer and counter row was considered and rejected: it costs a row action
on every row, and VTT, Encounters and Music have no row to put a pin on.

## Decision

- **The tray holds up to four sections, plus Dice.** A section is VTT, Music, Encounters, one
  counter or one timer, in any mix. Dice is always there, always last and never counted: the
  shared pool and the Dice pop-up have no other home.
- **One control chooses them.** A `chrome-btn` with a "Choose what the tray shows" tooltip sits
  just left of Dice and pops up (ADR 0009, `PopKind` gains `tray`) a checklist in three groups:
  VTT, Music and Encounters; the campaign's counters; its timers. A count reads "3 of 4". At four,
  the unchecked boxes are disabled, with a tooltip that says the tray is full and to uncheck one.
  Empty groups say so ("No timers in this campaign"). Escape closes it, as every pop-up.
- **Order is fixed, not dragged**: VTT, Music, Encounters, then counters, then timers, each in
  its tool's own order. Reordering a timer in its tool reorders it on the tray.
- **The dock keeps the same family order**: Scenes, Music, Quick notes, Counters, Timers
  (`MINOR_KINDS`), in every layout. `normalize` sorts a layout's dock sections into it, so
  layouts saved in the old order (Music first) take it too; the unused `reorderSection` is gone.
- **A timer section** shows the stopwatch, the name and the time left, and the timer's main
  button (Start, Pause, Resume or Start again), and Reset (disabled while it is idle). At zero it turns to the danger colour like the
  row. **A counter section** shows the tally, the name and the value, and − and + by its primary
  step; it shows a reached bound as the row does. Clicking the name opens the tool and focuses
  that row. Both are mirrors: every control on them is also in the tool.
- **Saved with the layout.** `ShellLayout` gains `tray: TrayItem[]` (at most four), where a
  `TrayItem` is `'map' | 'encounters' | 'music' | 'timer:<id>' | 'counter:<id>'`. It is saved
  in each campaign's console and captured by the DM's layouts, and a layout saved without it gets
  `['map', 'encounters', 'music']`, today's tray. No Library schema bump: the field is additive
  with a default.
- **Missing items drop out**, as a layout's missing web tabs do: applying a layout made in another
  campaign keeps VTT, Encounters and Music but drops its timers and counters, and deleting a timer
  or counter takes it off the tray. Its slot is simply free.

## Consequences

- A DM with no TV can give the tray to two timers and two counters; the defaults look as before.
- Four sections and Dice fit at the CI runners' width (under 1180 px) only with the section text
  truncating, as the Music title does today; the smoke spec checks a full tray at that width.
- Not done: dragging sections to reorder, a hotkey per tray slot, more than four sections,
  pinning from a timer or counter row.
