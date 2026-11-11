# ADR 0022 · Back pauses a fight; any number can wait in progress

**Status:** accepted, 2026-11-10. Amends ADR 0005 (one fight at a time, the list a click away).
Refines `DESIGN.md` §6.4.

## Context

ADR 0005 kept one running fight: Back from the tracker showed the list over it with a "Return to
fight" banner, and every other Start and Resume was disabled until that fight ended. Leaving to
the Library and coming back unloaded the fight, after which its encounter listed as "combat in
progress" and the others could start, so the two paths disagreed. A split party needs two fights
going at once.

## Decision

- **One fight is loaded, any number are in progress.** The tracker shows the loaded fight. A
  fight's state lives on its encounter (`Encounter.state`), so a fight not loaded is simply
  paused.
- **Back pauses.** Back to encounters saves the fight's state to its encounter and unloads the
  tracker. The encounter lists as "combat in progress · round N" with Resume. There is no
  banner.
- **Start and Resume are always available.** Starting or resuming another encounter pauses the
  loaded fight first. If that save fails, the loaded fight stays loaded and the error shows; no
  state is dropped.
- **A started fight is saved at once**, so backing out before the first change still lists it as
  in progress (round 0).
- The live strip and the map follow the loaded fight only. Placing an encounter on the map still
  waits until no fight is loaded.

## Consequences

`combatStore.browsing` and `setBrowsing` are gone; `pause()` replaces them. The builder no
longer needs to know about a running fight, because it only shows when none is loaded.
