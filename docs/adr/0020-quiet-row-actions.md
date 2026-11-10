# ADR 0020 · Row actions are always on screen, quiet until their row is in use

**Status:** accepted, 2026-11-10. Amends ADR 0013 (row actions hidden until hover) and
`docs/UI-GUIDELINES.md` §8 and §11.

## Context

ADR 0013 hid row actions until the row was hovered, focused or selected. Their space was kept,
so nothing moved, but the reserved space read as an empty patch: in a counter's first line the
always-visible parts (a TV badge, the range) sat in front of a gap that filled in only on hover,
and looked misplaced. The DM also found the behaviour inconsistent from list to list and could
not tell what a row offered without pointing at it.

## Decision

- **Quiet, never hidden.** Row actions (`.row-actions`), scene actions, the tracker's reorder
  arrows, a stat block's roll modes and a tab's close button are always on screen, each in its
  own place, at the `--quiet` opacity token (0.45). They come up to full when their row (or tab)
  is hovered, holds focus or is selected, and a control is full while hovered or focused itself.
  One rule in `responsive.css` does this for every list; there are no per-feature reveals.
- **States stay readable.** A toggle that is on (`aria-pressed="true"`) is full at rest, since
  its state is information: the counter's TV button lights while it is on the TV, which replaces
  the separate TV badge.
- **Disabled reads differently from quiet.** A disabled icon button drops its colour (a disabled
  Delete is grey, not faded red), sits at the fainter `--disabled` opacity (0.25) and shows a
  not-allowed pointer; it stays that way when its row is hovered. Text buttons keep their 0.5
  fade and get the same pointer. At 0.4 a disabled button had been indistinguishable from a quiet
  one at a glance.
- **No exceptions.** The Encounters list, whose actions were pinned at full strength by an earlier
  choice, is quiet too, and its actions now run Play, Edit, Delete like the others (play used to
  come last, outside the group). Each action keeps its slot on every row: one that does not apply
  (Edit on a fight left unfinished, Delete for the fight in progress) stays disabled with a `title` saying
  why, instead of disappearing and shifting its neighbours. `.row-actions.pinned` is gone.
- Layout does not change: hidden controls already held their space.

## Consequences

- Every list looks the same: the DM sees what a row offers before reaching for it.
- Lists are a little busier at rest; the quiet opacity keeps the row's own content in front.
- Features keep using `.row-actions` (or the classes above); a new list that reveals actions
  some other way is a bug.
