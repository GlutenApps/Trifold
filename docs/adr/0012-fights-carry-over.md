# ADR 0012 · Fights carry over: HP persists, the tracker drives the map

**Status:** accepted, 2026-11-06. Refines DESIGN.md §6.3, §6.4 and §6.5.

## Context

Every fight started from full HP. A party that limped out of one encounter walked into the
next one healed, and a villain who escaped came back untouched. The tracker and the map also
kept separate "hidden" and "dead" flags: hiding a combatant took it off the TV's initiative
strip but left its token on the TV's map, and the map's own hide left the strip alone. The
two were only loosely tied: a combatant knew its token id when the fight had been started
from a map, and nothing linked a token placed afterwards.

Some tables never open the map, so Encounters has to work alone. When the map is open,
Encounters is almost always running too, and the DM needs to see at a glance which tokens
are in the fight.

## Decision

**HP carries between fights.** A PC card keeps `currentHp` and `tempHp`; a fight starts a
PC from them and writes them back when it ends. A creature from the compendium is always
fresh. A creature that must carry wounds is a **named NPC**: NPC records gain an `hp` block
and the alive flag already there is kept current. Any creature in the builder or the tracker
has **Track as NPC**, which creates the NPC record (one creature out of a group becomes its
own template, taking its token), and the builder lists NPCs that can fight. Write-back
happens in the main process when the encounter finishes, after the renderer has flushed the
final state, so the result and the carried HP come from the same file. The Party tab shows
current HP and has **Long rest**; the NPCs tab shows carried HP and has **Restore**.

**One hidden, one dead.** During a fight a combatant's `hidden` and `dead` are the truth
and its token follows: every change writes through to the token wherever its scene lives
(the open draft, else the saved scene, mirrored to the TV when live). The map's own hide and
dead controls on a token in the fight act on the combatant instead. Outside a fight the token
flags stand alone, as before.

**Links by identity, never by name alone.** A combatant and a token match when they point
at the same PC card, the same NPC, the same compendium record (by key), or the same custom
name. Markers never match. The comparison is always between the **running encounter** and
the **map in play**: the live scene when it is a map, else the scene the encounter was placed
on. On that map:

- a linked token wears its place in the turn order; an unlinked PC or creature token wears a
  circled question mark in that spot instead;
- the tracker marks linked rows "map" and the open row offers **Link to map**; selecting an
  unlinked token on the map shows **Link to the fight** in its inspector;
- Link to the fight ties to the one matching unlinked combatant, asks when there are several,
  and adds a newcomer when there are none; Link to map does the same the other way and drops a
  new token in the middle of the map when nothing matches;
- links that need no judgement (a label equal to the combatant's name, or one free pair of
  an identity) are made on their own when the fight begins, when the map in play changes
  and when tokens are placed;
- the encounter drives: when the fight begins, combatants adopt the hidden and dead state of
  the tokens already on the map (the players' view at that moment); from then on a newly
  linked token takes the combatant's flags. Switching the live map mid-fight leaves the old
  scene untouched and links afresh on the new one.

Links are saved back to the encounter's templates, so the next run on that map has them.

**The hold button goes.** "Hold the turn" (skipped by Next until released) is a house-rule
convenience the 2024 rules do not need; it leaves the row toolbar. The `held` field and the
turn logic stay so saved fights still load. Hide uses an eye, Mark dead a skull, and End
combat is a red text button.

## Consequences

- `PCCard` gains `currentHp?` and `tempHp?`; `NPC` gains `hp?`. Both optional, so campaign
  files stay at schema 1 and old files read unchanged.
- `combatantFromNpc` in the builder; `npcs` in `BuildOptions`; the store gains `linkToken`,
  `relinkTokens`, `addFromToken` and `trackAsNpc`; the scene store gains `patchScene` and
  `patchTokenAnywhere`; `tokenLinks.ts` holds the pure matching rules with tests.
- `finishEncounter` in the repository carries HP over; the renderer reloads the bundle after
  a fight ends so cards and NPCs show the new numbers.
- Tests: identity matching and auto-linking, template rewriting, PC and NPC builds, the
  store's write-through and linking, the map's badges and menu, the builder's Track as NPC,
  the repository's carry-over, and the schema's optional fields.
