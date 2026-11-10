# ADR 0019 · Counters in the dock, one file per counter, up to three on the TV

**Status:** accepted, 2026-11-10. Amends ADR 0009 and ADR 0018 (a fourth dock tool). Refines
`DESIGN.md` §5.2 (a new campaign object) and §6.3.

## Context

At the table the DM keeps small numbers that belong to no combatant: rounds until a ritual
completes, the lich's legendary resistances, torches left, waves of enemies still to come. The
combat tracker's counters (`Combatant.counters`) live inside one fight and end with it; the rest
ended up on paper.

## Decision

- **A dock tool, Counters**, beside Music, Scenes and Quick notes (`MINOR_KINDS` gains
  `counters`; a saved layout without it gets it as a closed section, so no Library schema
  change). `Ctrl+Alt+C` opens it and focuses the first counter, or New counter when there are
  none. No starter layout opens it; layouts get revisited once the smaller tools have landed.
- **A counter** is `CampaignCounter`: `{ name, initial, value, min?, max?, step, altStep?,
  showOnTv?, order }`, whole numbers, negatives allowed. `min` and `max` are optional; when both
  are set, `min ≤ max`, and the initial value is inside them. The DM sets both steps: `step`, the
  primary step (default 1), is the pair either side of the value; `altStep`, the alternate step,
  is optional and adds an outer pair only when set. (A first cut had a fixed ±1 pair and a
  "step" defaulting to 5; a DM typed 1 into it not knowing ±1 was already there.) The name
  differs from the combatant `Counter`, which stays as it is.
- **Storage** is one file per counter, `campaigns/<slug>/counters/<id>.json` (file kind
  `counter`, version 1), like notes and scenes, so backups, campaign export and import, and
  migrations treat it like any other object. A campaign made before counters has no folder and
  lists none; the first save makes it. A fresh-start export puts every value back to its initial
  value. No campaign schema version moves.
- **Changing a value.** −alternate, −primary, +primary and +alternate buttons around the value
  (the outer pair only with an alternate step); clicking the value types one (Enter takes it,
  Escape keeps the old one). While focus is anywhere in a counter: ↑/↓ the primary step,
  Shift+↑/↓ and PageUp/PageDown the alternate step (the primary one when there is none), Home/End
  go to a bound that is set. **No mouse wheel**: a DM who thinks they are scrolling the
  compendium while a counter still has focus would change it without noticing. Every change is
  clamped to the bounds (`setCounterValue` in `@trifold/rules`).
- **Bounds show.** A counter on a bound shows its value in the warning colour with a `min` or
  `max` badge, and the button that cannot move further is dimmed but stays clickable. A change
  that runs into a bound, by landing on it or being stopped by it, flashes the value (no flash
  with reduced motion; the colour and badge stay).
- **Saving.** A change shows at once and is written about 300 ms after the last press, through
  the pending-saves queue, so a burst of clicks is one write and a waiting value is written
  before a backup, a campaign switch or quitting. Create, edit, delete and reorder are written
  straight away. A failed write is a banner in the tool.
- **Row actions** (show on TV, reset to the initial value, edit, delete) are always on screen,
  quiet until the row is in use (ADR 0020); the range, when set, sits under the buttons; delete takes the inline confirm. Edit opens the same form as New counter in place; it keeps the value
  and pulls it inside new bounds. Rows drag to reorder.
- **On the TV.** Show on TV marks a counter (`showOnTv`, written straight away); its TV row
  action stays lit while the counter is on the TV (ADR 0020). At most three are on at once: with three on, the others'
  toggle is off until one comes off, and if files ever say more, the TV takes the first three in
  list order (`tvCounters`). The console sends them in `PresenterState.counters` (name, value,
  max, the bound it sits on; never the initial value or steps), and the player draws them stacked
  in the bottom-left corner, opposite the round counter (under the TV timer since ADR 0021), as "Name  value / max", the value in the
  warning colour on a bound. The TV tab's Overlays pop-up has a **Counters** switch that hides
  them all without unmarking any (ADR 0008: the TV tab holds every screen control). Blackout,
  handouts and the break screen behave as for the other overlays. A fresh-start export keeps the
  marks; they are setup, not play.

## Consequences

- The dock has four tools; at 900 px high the last open one scrolls inside, as before.
- The Hotkeys sheet gains a group for keys that act on a focused control (`FOCUSED_KEYS` in
  `hotkeys.ts`), starting with the counter keys.
- Opening, creating or closing a campaign now writes every waiting save first, so a counter's
  (or a note's) last change can never land in the next campaign.
- Not done: a player-facing name different from the DM's, choosing where on the TV counters
  sit, counters that tick with combat rounds, resetting on a rest, and reorder from the
  keyboard.
