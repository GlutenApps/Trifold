# ADR 0005 · Encounters hosts combat; place an encounter on a map

**Status:** accepted, 2026-09-28. Refines ADR 0004 (stage majors).

## Context

ADR 0004 gave Encounters and Combat a tab each. They are one workflow: an
encounter is built, then fought, then its result is kept with it. Two tabs
meant finding the second one after pressing Start combat, a Combat tab that
was empty whenever no fight ran, and one more tab in every layout.

From a map, fights started only from the creature tokens already on it (or a
scene's linked encounter). A prepared encounter could not be put on a map
without placing each creature by hand.

## Decision

**One tab.** The majors are Campaign, Compendium, Encounters, Map. Encounters
shows the encounter list and builder while no fight runs, and the combat
tracker while one does. The tab carries the live pip during a fight.

- The tracker's bar has **Browse encounters**: the list comes back over the
  running fight with a "Return to fight" banner. Other encounters can be read
  and edited but not started, and the running one cannot be removed. One
  fight at a time, as before.
- When a fight ends, a result card (rounds, XP, fallen PCs, export log) shows
  above the list until dismissed.
- Everything that brought Combat forward (a fight starting anywhere, the live
  strip, Ctrl+K and map routing that avoid the tracker) now targets Encounters.
- Starter layouts: Table is Map + Campaign beside Encounters + Compendium;
  Combat maximizes Encounters.

**Place encounter on a map.** The map's Creatures group gains **Place
encounter…**, a list of built encounters not in a fight. Picking one drops a
token per creature (one per unit of quantity, numbered like the tracker),
**hidden from the players**, in a spaced block at the middle of the DM's
view, and links the encounter to the scene. The DM drags them into place,
reveals them (per token, or **Reveal creatures** for all), and presses the
existing **Start linked encounter**. Placing is not starting: initiative and
the TV's initiative strip wait until the DM is ready.

- Templates gain optional `tokenIds`, one per numbered creature, so every
  creature in a group is tied to its own token; `tokenId` still covers a
  single token.
- Starting a linked encounter also brings in creature tokens on the map that
  are not in it (as one-creature templates), and ties PC templates to the
  party's tokens. No prompt: every creature token on the map fights, which is
  what **Start combat from tokens** already did.
- PCs are never dropped; they keep their own tokens and entry markers.

**Saved layouts reset.** Library schema 2 → 3 clears saved layouts and
per-campaign consoles and re-seeds the starters, like 1 → 2 did for ADR 0004.
Layouts are chrome, not user content, and a mapping from the old tabs was
judged not worth keeping.

## Consequences

- `MajorKind` loses `combat`; `library.json` is schema 3.
- A DM who saved custom layouts rebuilds them once.
- Tests: layout math and shell tests use four majors; the tracker/list swap,
  result card, per-creature token links and map placement each have a test.
